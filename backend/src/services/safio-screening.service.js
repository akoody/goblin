import { db } from '../config/db.js';
import { createSafioClient, validateSafioResult, safioConfigured } from './safio-client.js';
import { autoApproveDeposit } from './deposit-compliance.service.js';
export { safioConfigured } from './safio-client.js';

export async function runSafioCycle() {
  if (!safioConfigured()) return;
  const connection = await db.getConnection();
  let locked = false;
  try {
    const [[lock]] = await connection.query("SELECT GET_LOCK('goblin-safio-screening',0) AS acquired");
    locked = Number(lock.acquired) === 1;
    if (!locked) return;
    await connection.query("UPDATE deposit_aml_checks SET status='failed',error_code='SAFIO_DEADLINE_EXCEEDED' WHERE status IN ('pending','running') AND created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)");
    // Backfill is explicit: historic deposits do not silently incur new charges.
    await connection.query(`INSERT IGNORE INTO deposit_aml_checks (deposit_id)
      SELECT d.id FROM blockchain_deposits d JOIN deposit_reviews r ON r.deposit_id=d.id
      WHERE r.status='PENDING_AML' AND ((d.network='TRON' AND d.currency IN ('USDT','TRX')) OR (d.network='SOLANA' AND d.currency='SOL') OR (d.network='ETHEREUM' AND d.currency='ETH'))
      AND d.from_address IS NOT NULL AND r.created_at >= ?`, [process.env.SAFIO_START_AT || '9999-12-31']);
    const [jobs] = await connection.query(`SELECT d.*,a.check_id FROM deposit_aml_checks a
      JOIN blockchain_deposits d ON d.id=a.deposit_id JOIN deposit_reviews r ON r.deposit_id=d.id
      WHERE r.status='PENDING_AML' AND a.status IN ('pending','running')
      AND a.next_attempt_at<=NOW() ORDER BY a.next_attempt_at LIMIT 5`);
    const client = createSafioClient(process.env.SAFIO_API_KEY.trim());
    for (const deposit of jobs) {
      try {
        if (!deposit.check_id) {
          const check = await client.create(deposit);
          if (!/^[0-9a-f-]{36}$/i.test(check.check_id || '')) throw new Error('SAFIO_INVALID_CHECK_ID');
          await connection.execute(`UPDATE deposit_aml_checks SET check_id=?,status='running',
            next_attempt_at=DATE_ADD(NOW(), INTERVAL 30 SECOND),error_code=NULL WHERE deposit_id=?`, [check.check_id, deposit.id]);
          continue;
        }
        const check = await client.get(deposit.check_id);
        if (check.check_id !== deposit.check_id) throw new Error('SAFIO_CHECK_MISMATCH');
        const assessment = validateSafioResult(check, deposit);
        const terminal = assessment || ['failed','error','cancelled'].includes(check.status);
        await connection.execute(`UPDATE deposit_aml_checks SET status=?,result_json=?,
          next_attempt_at=DATE_ADD(NOW(), INTERVAL 60 SECOND),error_code=NULL WHERE deposit_id=?`,
        [assessment ? 'completed' : terminal ? 'failed' : 'running', JSON.stringify(check), deposit.id]);
        // Persist evidence first; settlement independently revalidates it under database locks.
        if (assessment) await connection.execute(`UPDATE deposit_reviews SET report_provider='Safio',
          report_reference=?,risk_level=? WHERE deposit_id=? AND status='PENDING_AML'`,
        [`Safio check ${deposit.check_id}; sender address screening; coverage=${assessment.coverage}; decision=${assessment.decision}`, assessment.riskLevel, deposit.id]);
      } catch (error) {
        const code = /^SAFIO_[A-Z0-9_]+$/.test(error.message) ? error.message : 'SAFIO_REQUEST_FAILED';
        await connection.execute(`UPDATE deposit_aml_checks SET status=IF(attempts>=4,'failed',status),attempts=attempts+1,error_code=?,
          next_attempt_at=DATE_ADD(NOW(), INTERVAL 10 MINUTE) WHERE deposit_id=?`, [code, deposit.id]);
      }
    }
    const [ready] = await connection.query(`SELECT a.deposit_id FROM deposit_aml_checks a
      JOIN deposit_reviews r ON r.deposit_id=a.deposit_id
      WHERE a.status='completed' AND r.status='PENDING_AML' AND r.risk_level='LOW'
      AND a.attempts<5 AND a.next_attempt_at<=NOW() ORDER BY a.next_attempt_at LIMIT 10`);
    for (const job of ready) {
      try {
        await autoApproveDeposit(job.deposit_id);
      } catch (error) {
        const code = error.code === 'DEPOSIT_BELOW_MINIMUM' ? 'DEPOSIT_BELOW_MINIMUM' : 'AUTO_CREDIT_REVIEW_REQUIRED';
        await connection.execute(`UPDATE deposit_aml_checks SET attempts=attempts+1,error_code=?,
          next_attempt_at=DATE_ADD(NOW(), INTERVAL 10 MINUTE) WHERE deposit_id=?`, [code, job.deposit_id]);
      }
    }
  } finally {
    if (locked) await connection.query("SELECT RELEASE_LOCK('goblin-safio-screening')");
    connection.release();
  }
}

export function startSafioScreening() {
  const run = () => runSafioCycle().catch(() => console.error('Safio screening cycle failed; deposits remain held'));
  run();
  const timer = setInterval(run, 30000);
  timer.unref?.();
  return timer;
}

const BASE = 'https://platform.safio.io/api/v1';
export const safioNetwork=currency=>({SOL:'solana',ETH:'ethereum',USDT:'tron',TRX:'tron'}[currency]||null);
export function safioConfigured() {
  return Boolean(process.env.SAFIO_API_KEY?.trim() && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(process.env.SAFIO_START_AT || ''));
}

export function canAutoCreditSafio(check, deposit) {
  const assessment = validateSafioResult(check, deposit);
  return assessment?.riskLevel === 'LOW' && assessment.coverage === 'complete' && assessment.decision === 'allow';
}

export function createSafioClient(apiKey, fetchImpl = fetch) {
  async function call(path, body, idempotencyKey) {
    const response = await fetchImpl(`${BASE}/${path}`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey,
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
      body: JSON.stringify(body),
    });
    // Provider messages may contain request data; expose only a bounded error code.
    if (!response.ok) throw new Error(`SAFIO_HTTP_${response.status}`);
    const envelope = await response.json();
    if (envelope.error || !envelope.data) throw new Error('SAFIO_PROVIDER_ERROR');
    return envelope.data;
  }
  return {
    capabilities: () => call('aml/capabilities/get', {}),
    create: (deposit) => {if(!safioNetwork(deposit.currency))throw new Error('SAFIO_UNSUPPORTED_NETWORK');return call('aml/checks/create', {
      subject: { type: 'address', value: deposit.from_address },
      network: safioNetwork(deposit.currency), asset: deposit.currency, product: 'screen',
      allow_product_upgrade: false,
    }, `goblin-deposit-${deposit.id}-screen-v1`);},
    get: (id) => call('aml/checks/get', { id }),
  };
}

export function validateSafioResult(check, deposit) {
  const result = check.result;
  if (check.status !== 'completed' || !result || check.error) return null;
  const subject = result.subject;
  if (result.product !== 'screen' || subject?.type !== 'address' ||
      !safioNetwork(deposit.currency) || subject.value !== deposit.from_address || subject.network !== safioNetwork(deposit.currency) ||
      subject.asset !== deposit.currency) throw new Error('SAFIO_SUBJECT_MISMATCH');
  // An incomplete or unknown assessment never grants permission to credit funds.
  const level = String(result.risk_level || '').toUpperCase();
  return {
    riskLevel: level === 'HIGH' ? 'HIGH' : result.coverage_status === 'complete' &&
      ['LOW', 'MEDIUM'].includes(level) && ['allow','review'].includes(result.decision) ? level : 'UNKNOWN',
    coverage: result.coverage_status, decision: result.decision,
    riskScore: result.risk_score ?? null,
  };
}

import { transact } from './commerce.service.js';

export const controlColumns = Object.freeze({
  depositsEnabled: 'deposits_enabled', withdrawalsEnabled: 'withdrawals_enabled',
  internalTransfersEnabled: 'internal_transfers_enabled', p2pEnabled: 'p2p_enabled',
  nftEnabled: 'nft_enabled', guarantorEnabled: 'guarantor_enabled', tradingEnabled: 'trading_enabled',
  marketAccountsEnabled: 'market_accounts_enabled', marketServicesEnabled: 'market_services_enabled',
});

export function userControlChanges(body) {
  const changes = {};
  if (Object.hasOwn(body, 'status')) {
    if (!['active', 'blocked'].includes(body.status)) throw Object.assign(new Error('Некорректный статус'), { status: 400 });
    changes.status = body.status;
  }
  for (const [key, column] of Object.entries(controlColumns)) {
    if (!Object.hasOwn(body, key)) continue;
    if (typeof body[key] !== 'boolean') throw Object.assign(new Error('Настройка должна быть включена или выключена'), { status: 400 });
    changes[column] = body[key] ? 1 : 0;
  }
  if (!Object.keys(changes).length) throw Object.assign(new Error('Нет изменений'), { status: 400 });
  return changes;
}

export async function updateUserControls(actorId, userId, body) {
  const changes = userControlChanges(body || {});
  return transact(async connection => {
    const [[user]] = await connection.execute('SELECT status FROM users WHERE id=? FOR UPDATE', [userId]);
    if (!user) throw Object.assign(new Error('Пользователь не найден'), { status: 404 });
    if (user.status === 'deleted') throw Object.assign(new Error('Удалённый аккаунт нельзя активировать'), { status: 409 });
    await connection.execute(`UPDATE users SET ${Object.keys(changes).map(column => `${column}=?`).join(',')} WHERE id=?`, [...Object.values(changes), userId]);
    await connection.execute('INSERT INTO user_access_audit (actor_id,user_id,changes) VALUES (?,?,?)', [actorId, userId, JSON.stringify(changes)]);
  });
}

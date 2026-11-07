import { db } from '../config/db.js';
import { transact } from './commerce.service.js';

export const helperPermissions = Object.freeze({chat:'Чаты поддержки',security:'Безопасность: история входов',p2p:'P2P-сделки: просмотр',transactions:'Транзакции биржи: просмотр',referrals:'Приглашения и реферальные ссылки',balances:'Балансы пользователей: просмотр'});
const normalize = value => String(value || '').trim().toLowerCase();
export function isAdministratorEmail(email) {
  return String(process.env.ADMIN_EMAILS || process.env.VITE_ADMIN_EMAILS || '').split(/[,;\n]/).map(normalize).filter(Boolean).includes(normalize(email));
}
export async function staffAccess(userId, executor = db) {
  const [[user]] = await executor.execute("SELECT id,email,status FROM users WHERE id=?",[userId]);
  if (!user || user.status !== 'active') return {role:'user',permissions:[]};
  if (isAdministratorEmail(user.email)) return {role:'admin',permissions:Object.keys(helperPermissions)};
  const [rows] = await executor.execute(`SELECT p.permission FROM staff_helpers h LEFT JOIN staff_helper_permissions p ON p.user_id=h.user_id WHERE h.user_id=? AND h.enabled=1`,[userId]);
  return {role:rows.length?'helper':'user',permissions:rows.map(r=>r.permission).filter(p=>Object.hasOwn(helperPermissions,p))};
}
export async function hasStaffPermission(userId, permission, executor = db) {
  const access=await staffAccess(userId,executor);
  return access.role==='admin' || access.permissions.includes(permission);
}
export function helperRoutePermission(method,path) {
  if(method==='GET'&&(path==='/wallet-users'||/^\/wallet-users\/\d+\/balances$/.test(path)))return 'balances';
  if(method==='GET' && path==='/login-ips' || method==='PATCH' && /^\/login-ips\/\d+\/review$/.test(path))return 'security';
  if(method==='GET' && ['/transactions','/transaction-history','/trading'].includes(path))return 'transactions';
  if(method==='GET' && (path==='/referrals'||/^\/referrals\/\d+\/invitees$/.test(path)) || method==='POST' && /^\/referrals\/\d+\/link$/.test(path))return 'referrals';
  return null;
}
export function validateHelperConfiguration(body) {
  if(typeof body?.enabled!=='boolean'||!Array.isArray(body.permissions)||body.permissions.some(p=>typeof p!=='string'||!Object.hasOwn(helperPermissions,p))||new Set(body.permissions).size!==body.permissions.length)throw Object.assign(new Error('Некорректные права хелпера'),{status:400});
  return {enabled:body.enabled,permissions:body.permissions};
}
export async function saveHelper(actor,identifier,body) {
  const config=validateHelperConfiguration(body);
  return transact(async c=>{
    if((await staffAccess(actor,c)).role!=='admin')throw Object.assign(new Error('Только администратор управляет хелперами'),{status:403});
    const [[user]]=await c.execute('SELECT id,email,status FROM users WHERE id=? OR LOWER(email)=? LIMIT 1 FOR UPDATE',[/^\d+$/.test(String(identifier))?identifier:0,normalize(identifier)]);
    if(!user)throw Object.assign(new Error('Пользователь не найден. Сначала он должен зарегистрироваться.'),{status:404});
    if(isAdministratorEmail(user.email))throw Object.assign(new Error('Права администратора здесь не изменяются'),{status:400});
    if(user.status!=='active'&&config.enabled)throw Object.assign(new Error('Аккаунт не активен'),{status:409});
    await c.execute('INSERT INTO staff_helpers (user_id,enabled,updated_by) VALUES (?,?,?) ON DUPLICATE KEY UPDATE enabled=VALUES(enabled),updated_by=VALUES(updated_by)',[user.id,config.enabled?1:0,actor]);
    await c.execute('DELETE FROM staff_helper_permissions WHERE user_id=?',[user.id]);
    for(const permission of config.permissions)await c.execute('INSERT INTO staff_helper_permissions (user_id,permission) VALUES (?,?)',[user.id,permission]);
    await c.execute('INSERT INTO staff_helper_audit (actor_id,user_id,configuration) VALUES (?,?,?)',[actor,user.id,JSON.stringify(config)]);
    return {success:true};
  });
}
export async function listHelpers() {
  const [rows]=await db.query(`SELECT h.user_id,h.enabled,h.updated_at,u.username,u.email,u.status FROM staff_helpers h JOIN users u ON u.id=h.user_id ORDER BY h.updated_at DESC`);
  const [permissions]=await db.query('SELECT user_id,permission FROM staff_helper_permissions');
  return {permissions:helperPermissions,helpers:rows.map(row=>({...row,enabled:Boolean(row.enabled),permissions:permissions.filter(p=>p.user_id===row.user_id).map(p=>p.permission)}))};
}

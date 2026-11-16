// Отчёт по деньгам платформы: каждая комиссия, которая пришла в казну (admin_treasury), и каждое списание из неё,
// с источником (сделка, депозит, запуск, вывод, выплата) и пользователем. Строки собираются из журналов, которые уже
// ведут сервисы; своих записей отчёт не делает. Сверка: остаток казны по валюте против суммы журналов.
import Decimal from 'decimal.js';
import { db } from '../config/db.js';

/** Виды строк отчёта: направление относительно казны и подпись. */
export const INCOME_KINDS = {
  P2P_FEE: { direction: 'IN', label: 'Комиссия P2P' },
  GUARANTOR_FEE: { direction: 'IN', label: 'Комиссия гаранта' },
  DEPOSIT_FEE: { direction: 'IN', label: 'Комиссия за пополнение' },
  PUMP_FEE: { direction: 'IN', label: 'Комиссия за запуск мемкоина' },
  WITHDRAWAL_FEE: { direction: 'IN', label: 'Комиссия за вывод BTC/ETH' },
  REFERRAL_REWARD: { direction: 'OUT', label: 'Реферальная выплата' },
  COLLECTION_FEE: { direction: 'OUT', label: 'Сеть: сбор средств в казну' },
  TREASURY_PAYOUT: { direction: 'OUT', label: 'Выплата из казны' },
};

const AMOUNT = 'DECIMAL(36,18)';
const kindsIn = Object.keys(INCOME_KINDS).filter(kind => INCOME_KINDS[kind].direction === 'IN').map(kind => `'${kind}'`).join(',');

// Каждая ветка повторяет то, как сервис меняет admin_treasury: приход, резерв или расход ровно на эту сумму.
// Текстовые колонки приводятся к одной сортировке: у таблиц они разные, а UNION смешивать их не умеет.
const t = sql => `CONVERT(${sql} USING utf8mb4) COLLATE utf8mb4_unicode_ci`;
const branch = ({ id, at, kind, currency, amount, gross = 'NULL', net = 'NULL', percent = 'NULL', user, sourceType, sourceId, details = 'NULL', from }) =>
  `SELECT ${t(id)} AS entry_id, ${at} AS at, ${t(`'${kind}'`)} AS kind, ${t(currency)} AS currency,
  CAST(${amount} AS ${AMOUNT}) AS amount, CAST(${gross} AS ${AMOUNT}) AS gross, CAST(${net} AS ${AMOUNT}) AS net,
  CAST(${percent} AS DECIMAL(12,6)) AS percent, ${user} AS user_id, ${t(`'${sourceType}'`)} AS source_type,
  ${t(`CAST(${sourceId} AS CHAR)`)} AS source_id, ${t(`CAST(${details} AS CHAR)`)} AS details
FROM ${from}`;

// Каждая ветка повторяет то, как сервис меняет admin_treasury: приход, резерв или расход ровно на эту сумму.
const BRANCHES = [
  branch({ id: "CONCAT('P2P_FEE:',f.id)", at: 'f.created_at', kind: 'P2P_FEE', currency: "'USDT'", amount: 'f.fee_amount', gross: 'f.gross_amount', net: 'f.net_amount', percent: 'f.fee_percent', user: 'f.seller_id', sourceType: 'P2P_DEAL', sourceId: 'f.deal_id', from: 'p2p_fee_ledger f' }),
  branch({ id: "CONCAT('GUARANTOR_FEE:',g.id)", at: 'g.created_at', kind: 'GUARANTOR_FEE', currency: 'd.currency', amount: 'g.fee_amount', gross: 'g.gross_amount', net: 'g.net_amount', percent: 'g.fee_percent', user: 'g.seller_id', sourceType: 'COMMERCE_DEAL', sourceId: 'g.deal_id', details: 'd.title', from: 'commerce_guarantor_fee_ledger g JOIN commerce_deals d ON d.id=g.deal_id WHERE g.fee_amount>0' }),
  branch({ id: "CONCAT('DEPOSIT_FEE:',l.id)", at: 'l.created_at', kind: 'DEPOSIT_FEE', currency: 'l.currency', amount: 'l.amount', gross: 'b.amount', net: 'b.amount-l.amount', user: 'l.user_id', sourceType: 'DEPOSIT', sourceId: 'l.deposit_id', details: "CONCAT('$',l.fee_usd,' · ',b.network,' · ',b.tx_hash)", from: 'admin_treasury_ledger l JOIN blockchain_deposits b ON b.id=l.deposit_id' }),
  branch({ id: "CONCAT('PUMP_FEE:',p.launch_id)", at: 'p.created_at', kind: 'PUMP_FEE', currency: "'SOL'", amount: 'p.amount_sol', user: 'p.user_id', sourceType: 'PUMP_LAUNCH', sourceId: 'p.launch_id', from: 'pump_fee_ledger p' }),
  branch({ id: "CONCAT('WITHDRAWAL_FEE:',n.id)", at: 'n.created_at', kind: 'WITHDRAWAL_FEE', currency: 'n.currency', amount: 'n.amount', user: 'w.user_id', sourceType: 'NATIVE_JOB', sourceId: 'n.job_id', details: 'j.tx_hash', from: "native_fee_ledger n JOIN wallets w ON w.id=n.wallet_id LEFT JOIN native_chain_jobs j ON j.id=n.job_id WHERE n.kind='withdrawal'" }),
  branch({ id: "CONCAT('REFERRAL_REWARD:',e.id)", at: 'e.created_at', kind: 'REFERRAL_REWARD', currency: 'e.currency', amount: 'e.reward_amount', gross: 'e.fee_amount', percent: 'e.rate_percent', user: 'e.referrer_id', sourceType: 'REFERRAL', sourceId: "CONCAT(e.source_kind,':',e.source_id)", details: "CONCAT('плательщик #',e.payer_id,' · ',e.status)", from: "referral_commission_events e WHERE e.status IN ('pending','credited') AND e.reward_amount>0" }),
  branch({ id: "CONCAT('COLLECTION_FEE:',j.id)", at: 'j.updated_at', kind: 'COLLECTION_FEE', currency: 'j.currency', amount: 'j.network_fee', user: 'j.user_id', sourceType: 'NATIVE_JOB', sourceId: 'j.id', details: 'j.tx_hash', from: "native_chain_jobs j WHERE j.kind='collection' AND j.status IN ('confirmed','failed') AND j.network_fee>0" }),
  branch({ id: "CONCAT('COLLECTION_FEE:',c.id)", at: 'c.updated_at', kind: 'COLLECTION_FEE', currency: "'SOL'", amount: 'c.fee_charged', user: 'c.user_id', sourceType: 'COLLECTION_JOB', sourceId: 'c.id', details: 'c.tx_hash', from: "treasury_collection_jobs c WHERE c.network='SOLANA' AND c.status IN ('completed','failed') AND c.fee_charged>0" }),
  branch({ id: "CONCAT('TREASURY_PAYOUT:',o.id)", at: 'o.updated_at', kind: 'TREASURY_PAYOUT', currency: 'o.currency', amount: "CASE WHEN o.status IN ('prepared','submitted','review','confirmed') THEN o.gross_amount WHEN o.currency='USDT' THEN 0 ELSE COALESCE(o.fee_charged,0) END", gross: 'o.gross_amount', net: 'o.received_amount', user: 'o.actor_id', sourceType: 'TREASURY_PAYOUT', sourceId: 'o.id', details: "CONCAT(o.status,' · ',o.destination,COALESCE(CONCAT(' · ',o.tx_hash),''))", from: "treasury_payouts o WHERE o.status IN ('prepared','submitted','review','confirmed','failed','cancelled')" }),
].join('\nUNION ALL\n');

const ENTRIES = `SELECT h.*, ${t(`CASE WHEN h.kind IN (${kindsIn}) THEN 'IN' ELSE 'OUT' END`)} AS direction
  FROM (${BRANCHES}) h WHERE h.amount>0`;

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const PAGE_SIZE = 50;

/** Фильтр отчёта из запроса: всё проверено и уходит параметрами, в SQL попадают только известные фрагменты. */
export function incomeReportFilter(query = {}) {
  const where = [], params = [];
  const text = (value, name, max = 100) => {
    if (value === undefined || value === null || value === '') return '';
    if (typeof value !== 'string' || value.length > max) fail(`Некорректный фильтр: ${name}`);
    return value.trim();
  };
  const kind = text(query.kind, 'вид');
  if (kind) { if (!INCOME_KINDS[kind]) fail('Неизвестный вид операции'); where.push('e.kind=?'); params.push(kind); }
  const direction = text(query.direction, 'направление');
  if (direction) { if (!['IN', 'OUT'].includes(direction)) fail('Направление: IN или OUT'); where.push('e.direction=?'); params.push(direction); }
  const currency = text(query.currency, 'валюта').toUpperCase();
  if (currency) { if (!/^[A-Z]{2,8}$/.test(currency)) fail('Некорректная валюта'); where.push('e.currency=?'); params.push(currency); }
  const from = text(query.from, 'дата с');
  if (from) { if (!DATE.test(from)) fail('Дата: ГГГГ-ММ-ДД'); where.push('e.at>=?'); params.push(`${from} 00:00:00`); }
  const to = text(query.to, 'дата по');
  if (to) { if (!DATE.test(to)) fail('Дата: ГГГГ-ММ-ДД'); where.push('e.at<DATE_ADD(?, INTERVAL 1 DAY)'); params.push(`${to} 00:00:00`); }
  const q = text(query.q, 'поиск');
  if (q) {
    // пользователь (#id, id или имя), источник (id сделки, депозита, задания) или хэш транзакции в деталях
    const id = /^#?(\d{1,20})$/.exec(q)?.[1] ?? null;
    const like = `%${q.replace(/[!%_]/g, ch => `!${ch}`)}%`;
    where.push(`(e.user_id=? OR e.source_id=? OR u.username LIKE ? ESCAPE '!' OR e.details LIKE ? ESCAPE '!')`);
    params.push(id ?? -1, q, like, like);
  }
  let page = 1;
  if (query.page !== undefined && query.page !== '') {
    page = Number(query.page);
    if (!Number.isInteger(page) || page < 1 || page > 1000000) fail('Некорректная страница');
  }
  return { where: where.length ? `WHERE ${where.join(' AND ')}` : '', params, page };
}

const FROM = (filter) => `FROM (${ENTRIES}) e LEFT JOIN users u ON u.id=e.user_id ${filter.where}`;
const rowOut = row => ({
  id: row.entry_id, at: row.at, kind: row.kind, label: INCOME_KINDS[row.kind]?.label ?? row.kind, direction: row.direction,
  currency: row.currency, amount: String(row.amount), gross: row.gross === null ? null : String(row.gross),
  net: row.net === null ? null : String(row.net), percent: row.percent === null ? null : String(row.percent),
  userId: row.user_id === null ? null : Number(row.user_id), username: row.username ?? null,
  sourceType: row.source_type, sourceId: row.source_id === null ? null : String(row.source_id), details: row.details ?? null,
});

/** Сумма приходов минус расходов по валютам и сравнение с остатком казны. */
export function reconcile(ledgerRows, treasuryRows) {
  const by = new Map();
  const entry = currency => {
    if (!by.has(currency)) by.set(currency, { currency, income: new Decimal(0), expense: new Decimal(0), treasury: new Decimal(0) });
    return by.get(currency);
  };
  for (const row of ledgerRows) {
    const item = entry(row.currency);
    if (row.direction === 'IN') item.income = item.income.plus(row.total); else item.expense = item.expense.plus(row.total);
  }
  for (const row of treasuryRows) entry(row.currency).treasury = new Decimal(row.balance);
  return [...by.values()].sort((a, b) => a.currency.localeCompare(b.currency)).map(item => {
    const ledger = item.income.minus(item.expense);
    return {
      currency: item.currency, income: item.income.toFixed(), expense: item.expense.toFixed(), ledgerNet: ledger.toFixed(),
      treasuryBalance: item.treasury.toFixed(), difference: item.treasury.minus(ledger).toFixed(), matches: item.treasury.eq(ledger),
    };
  });
}

export async function incomeReport(query = {}) {
  const filter = incomeReportFilter(query);
  const [rows] = await db.query(
    `SELECT e.*, u.username ${FROM(filter)} ORDER BY e.at DESC, e.entry_id DESC LIMIT ? OFFSET ?`,
    [...filter.params, PAGE_SIZE, (filter.page - 1) * PAGE_SIZE],
  );
  const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total ${FROM(filter)}`, filter.params);
  const [sums] = await db.query(
    `SELECT e.kind, e.direction, e.currency, SUM(e.amount) AS total, COUNT(*) AS count ${FROM(filter)} GROUP BY e.kind, e.direction, e.currency ORDER BY e.currency, e.kind`,
    filter.params,
  );
  const [ledger] = await db.query(`SELECT e.currency, e.direction, SUM(e.amount) AS total FROM (${ENTRIES}) e GROUP BY e.currency, e.direction`);
  const [treasury] = await db.query('SELECT currency, balance FROM admin_treasury');
  return {
    rows: rows.map(rowOut), total: Number(total), page: filter.page, pageSize: PAGE_SIZE,
    totals: sums.map(row => ({ kind: row.kind, label: INCOME_KINDS[row.kind]?.label ?? row.kind, direction: row.direction, currency: row.currency, total: String(row.total), count: Number(row.count) })),
    reconciliation: reconcile(ledger, treasury),
    kinds: Object.entries(INCOME_KINDS).map(([kind, value]) => ({ kind, ...value })),
  };
}

const CSV_LIMIT = 100000;
const cell = value => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** Тот же отчёт целиком в CSV (разделитель «;», UTF-8 с BOM: Excel открывает без настройки). */
export async function incomeReportCsv(query = {}) {
  const filter = incomeReportFilter({ ...query, page: undefined });
  const [rows] = await db.query(`SELECT e.*, u.username ${FROM(filter)} ORDER BY e.at DESC, e.entry_id DESC LIMIT ?`, [...filter.params, CSV_LIMIT]);
  const head = ['Дата', 'Операция', 'Направление', 'Валюта', 'Сумма', 'Сумма до комиссии', 'Сумма после комиссии', 'Ставка, %', 'ID пользователя', 'Пользователь', 'Источник', 'ID источника', 'Детали', 'ID записи'];
  const lines = rows.map(rowOut).map(row => [
    row.at instanceof Date ? row.at.toISOString() : row.at, row.label, row.direction === 'IN' ? 'приход' : 'расход', row.currency, row.amount,
    row.gross, row.net, row.percent, row.userId, row.username, row.sourceType, row.sourceId, row.details, row.id,
  ].map(cell).join(';'));
  return `﻿${[head.join(';'), ...lines].join('\r\n')}\r\n`;
}

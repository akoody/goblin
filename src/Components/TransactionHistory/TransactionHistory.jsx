import { useEffect, useState } from 'react';
import api from '../../api';
import { assetDecimal } from '../../Pages/Profile/walletAmounts.mjs';
import styles from './TransactionHistory.module.scss';

const statuses = { COMPLETED: 'Завершено', PENDING: 'Ожидает подтверждения', PENDING_AML: 'AML-проверка', PENDING_CHAIN: 'Сверка поступления', BLOCKED: 'Заблокировано', FAILED: 'Ошибка', CANCELLED: 'Отменено', REVIEW: 'Требует проверки' };
const directions = { IN: 'Ввод', OUT: 'Вывод', INTERNAL: 'Внутренний перевод', P2P: 'P2P' };
const initial = { from: '', until: '', min: '', max: '', address: '', direction: '', currency: '', status: '' };
function parameters(filters, page) {
  const params = { ...filters, page };
  if (params.from) params.from = new Date(`${params.from}T00:00:00`).toISOString();
  if (params.until) { const next = new Date(`${params.until}T00:00:00`); next.setDate(next.getDate() + 1); params.until = next.toISOString(); }
  return params;
}

export function TransactionHistory({ admin = false, currencyFilter = 'ALL', directionFilter = 'ALL', title = 'История транзакций', emptyText, compact = false }) {
  const [filters, setFilters] = useState(initial), [page, setPage] = useState(1), [data, setData] = useState(null);
  const [error, setError] = useState(''), [loading, setLoading] = useState(true), [refresh, setRefresh] = useState(0);
  const actual = { ...filters, ...(currencyFilter !== 'ALL' ? { currency: currencyFilter } : {}), ...(directionFilter !== 'ALL' ? { direction: directionFilter } : {}) };
  const key = JSON.stringify(actual);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setData(null);
    const timer = setTimeout(() => {
      api.get(admin ? '/admin/transaction-history' : '/api/transactions/statement', { params: parameters(JSON.parse(key), page), signal: controller.signal })
        .then(r => setData(r.data))
        .catch(e => { if (!controller.signal.aborted) setError(e.response?.data?.message || 'Не удалось загрузить историю'); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [admin, key, page, refresh]);
  const field = (name, value) => { setFilters(f => ({ ...f, [name]: value })); setPage(1); };
  return <section className={`${styles.history} ${compact ? styles.compact : ''}`}>
    <header><h2>{title}</h2><button type="button" disabled={loading} onClick={() => setRefresh(v => v + 1)}>Обновить</button></header>
    <div className={styles.filters}>
      <label>С даты<input type="date" value={filters.from} onChange={e => field('from', e.target.value)} /></label>
      <label>По дату включительно<input type="date" value={filters.until} onChange={e => field('until', e.target.value)} /></label>
      <label>Сумма от<input inputMode="decimal" value={filters.min} onChange={e => field('min', e.target.value)} /></label>
      <label>Сумма до<input inputMode="decimal" value={filters.max} onChange={e => field('max', e.target.value)} /></label>
      <label>Адрес, email, хеш или ID<input type="search" maxLength={255} value={filters.address} onChange={e => field('address', e.target.value)} /></label>
      {currencyFilter === 'ALL' && <label>Валюта<select aria-label="Валюта" value={filters.currency} onChange={e => field('currency', e.target.value)}><option value="">Все</option>{['BTC', 'ETH', 'USDT', 'TRX', 'SOL'].map(c => <option key={c}>{c}</option>)}</select></label>}
      {directionFilter === 'ALL' && <label>Направление<select aria-label="Направление" value={filters.direction} onChange={e => field('direction', e.target.value)}><option value="">Все</option>{Object.entries(directions).filter(([v]) => admin || v !== 'P2P').map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>}
      <label>Статус<select aria-label="Статус" value={filters.status} onChange={e => field('status', e.target.value)}><option value="">Все</option>{Object.entries(statuses).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <button type="button" onClick={() => { setFilters(initial); setPage(1); }}>Сбросить</button>
    </div>
    <p className={styles.note}>Даты указаны в вашем часовом поясе. Суммы — в валюте операции, без пересчёта в доллары.</p>
    {error && <p role="alert">{error}</p>}
    <div className={styles.table} tabIndex={0} role="region" aria-label={title} aria-busy={loading}>
      <table><thead><tr><th>ID / дата</th><th>Направление</th><th>Откуда</th><th>Куда</th><th>Сумма</th><th>Статус</th></tr></thead><tbody>
        {data?.rows.map(t => <tr key={t.id}>
          <td>{t.id}<time dateTime={t.createdAt}>{new Date(t.createdAt).toLocaleString('ru-RU')}</time></td>
          <td>{directions[t.direction] || t.direction}</td><td>{t.senderAddress || '—'}</td><td>{t.receiverAddress || '—'}{t.txHash && <small>Хеш: {t.txHash}</small>}</td>
          <td className={styles.amount}>{assetDecimal(t.amount)} {t.currency}</td><td>{statuses[t.status] || t.status}{Boolean(Number(t.amlNotChecked)) && <small>AML не выполнялся</small>}</td>
        </tr>)}
        {(loading || data?.rows.length === 0) && <tr><td colSpan={6}>{loading ? 'Загрузка…' : emptyText || 'По выбранным условиям транзакций нет'}</td></tr>}
      </tbody></table>
    </div>
    <footer><span role="status">{data ? `Найдено: ${data.total} · Страница ${page} из ${Math.max(1, Math.ceil(data.total / 50))}` : ''}</span><button type="button" disabled={loading || page <= 1} onClick={() => setPage(p => p - 1)}>Назад</button><button type="button" disabled={loading || !data || page * 50 >= data.total} onClick={() => setPage(p => p + 1)}>Далее</button></footer>
  </section>;
}

import { useEffect, useRef, useState } from 'react';
import api from '../../api';
import styles from './Referrals.module.scss';

const linkFor = code => `${window.location.origin}/signin?ref=${encodeURIComponent(code)}`;
const amount = value => String(value ?? '0').replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1');

function Amounts({ rows }) {
  if (!rows?.length) return <span>Нет пополнений</span>;
  return <div className={styles.amounts}>{rows.map(row => <div key={row.currency}>
    <strong>{row.currency}</strong>
    <span>Подтверждено: {amount(row.gross)}</span>
    <span>Комиссия: {amount(row.fee)}</span>
    <span>Зачислено: {amount(row.net)}</span>
    <span>Ожидает AML: {amount(row.pending)}</span>
    <span>Заблокировано: {amount(row.blocked)}</span>
  </div>)}</div>;
}

function Pages({ data, page, onChange, loading }) {
  const pages = Math.max(1, Math.ceil((data?.total || 0) / 25));
  return <div className={styles.pages}>
    <button type="button" disabled={loading || page <= 1} onClick={() => onChange(page - 1)}>Назад</button>
    <span role="status">Страница {page} из {pages} · Всего: {data?.total ?? '…'}</span>
    <button type="button" disabled={loading || page >= pages} onClick={() => onChange(page + 1)}>Далее</button>
  </div>;
}

export function Referrals() {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [invitePage, setInvitePage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState(null);
  const [invitees, setInvitees] = useState(null);
  const [loading, setLoading] = useState(true);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [copying, setCopying] = useState(false);
  const request = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const id = ++request.current;
    setLoading(true); setData(null); setError('');
    const timer = setTimeout(async () => {
      try {
        const response = await api.get('/admin/referrals', { params: { q: query, page }, signal: controller.signal });
        if (id === request.current) setData(response.data);
      } catch (e) {
        if (!controller.signal.aborted && id === request.current) setError(e.response?.data?.message || 'Не удалось загрузить приглашения');
      } finally { if (!controller.signal.aborted && id === request.current) setLoading(false); }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, page, refresh]);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    setInviteLoading(true); setInvitees(null); setError('');
    api.get(`/admin/referrals/${selected.id}/invitees`, { params: { page: invitePage }, signal: controller.signal })
      .then(response => { if (!controller.signal.aborted) setInvitees(response.data); })
      .catch(e => { if (!controller.signal.aborted) setError(e.response?.data?.message || 'Не удалось загрузить приглашённых'); })
      .finally(() => { if (!controller.signal.aborted) setInviteLoading(false); });
    return () => controller.abort();
  }, [selected, invitePage, refresh]);

  const copy = async user => {
    if (copying) return;
    setCopying(true); setNotice(''); setError('');
    try {
      const code = user.code || (await api.post(`/admin/referrals/${user.id}/link`)).data.code;
      const link = linkFor(code);
      // Show the link even when clipboard permission is unavailable.
      setNotice(link);
      try { await navigator.clipboard.writeText(link); setNotice(`Скопировано: ${link}`); } catch { /* copy manually */ }
      if (!user.code) setRefresh(value => value + 1);
    } catch (e) { setError(e.response?.data?.message || 'Не удалось получить ссылку'); }
    finally { setCopying(false); }
  };

  return <section className={styles.referrals}>
    <h2>Реферальные приглашения</h2>
    <p>По каждой ссылке — регистрации и внешние криптопополнения приглашённых за всё время. Подтверждённая сумма указана до комиссии, зачисленная — после. Внутренние переводы и сделки не считаются пополнениями. Разные валюты не складываются.</p>
    <div className={styles.toolbar}>
      <label>Поиск пригласившего<input type="search" value={query} maxLength={160} placeholder="Имя, email, ID или код" onChange={event => { setQuery(event.target.value); setPage(1); setSelected(null); }} /></label>
      <button type="button" disabled={loading} onClick={() => setRefresh(value => value + 1)}>Обновить</button>
    </div>
    {error && <p role="alert">{error}</p>}
    {notice && <p className={styles.link} role="status">{notice}</p>}
    {loading && <p role="status">Загружаем…</p>}
    <div className={styles.table}><table><thead><tr><th>Пригласивший</th><th>Ссылка</th><th>Регистрации</th><th>Пополнения по валютам</th><th>Подробности</th></tr></thead>
      <tbody>{data?.rows.map(user => <tr key={user.id}>
        <td>{user.username} · #{user.id}<div>{user.email}</div></td>
        <td>{user.code && <a href={linkFor(user.code)} target="_blank" rel="noreferrer">{user.code}</a>}<button type="button" disabled={copying} onClick={() => copy(user)}>{user.code ? 'Скопировать ссылку' : 'Выдать ссылку'}</button></td>
        <td>{user.invitedCount}</td><td><Amounts rows={user.amounts} /></td>
        <td><button type="button" onClick={() => { setSelected(user); setInvitePage(1); }}>Приглашённые #{user.id}</button></td>
      </tr>)}{data && !data.rows.length && <tr><td colSpan="5">Ничего не найдено</td></tr>}</tbody>
    </table></div>
    <Pages data={data} page={page} onChange={setPage} loading={loading} />
    {selected && <section>
      <h3>Пригласил: {selected.username} · #{selected.id}</h3>
      <button type="button" onClick={() => setSelected(null)}>Закрыть список</button>
      {inviteLoading && <p role="status">Загружаем приглашённых…</p>}
      <div className={styles.table}><table><thead><tr><th>Пользователь</th><th>Регистрация</th><th>Пополнения</th></tr></thead><tbody>
        {invitees?.rows.map(user => <tr key={user.id}><td>{user.username} · #{user.id}<div>{user.email}</div></td><td>{new Date(user.createdAt).toLocaleString('ru-RU')}</td><td><Amounts rows={user.amounts} /></td></tr>)}
        {invitees && !invitees.rows.length && <tr><td colSpan="3">По этой ссылке пока никто не зарегистрировался</td></tr>}
      </tbody></table></div>
      <Pages data={invitees} page={invitePage} onChange={setInvitePage} loading={inviteLoading} />
    </section>}
  </section>;
}

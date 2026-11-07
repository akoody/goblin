import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import { enqueueSnackbar } from 'notistack';
import api from '../../api';
import { formatMoney, formatDateTime, getDealStatusLabel, getPaymentMethodById } from './p2pUtils';
import { P2PMobileNav } from './P2PMobileNav';
import styles from './P2PWorkspace.module.scss';

const orderLabels = { pending: 'Активно', paused: 'На паузе', completed: 'Исполнено', cancelled: 'Отменено' };
const size = 20;
const same = (a, b) => a != null && b != null && String(a) === String(b);
const userId = () => { try { return jwtDecode(localStorage.getItem('token')).userId; } catch { return null; } };

export function P2PWorkspace({ offers = false }) {
  const [items, setItems] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [query, setQuery] = useState(''), [status, setStatus] = useState(offers ? 'all' : 'active'), [side, setSide] = useState('all'), [page, setPage] = useState(1);
  const [busy, setBusy] = useState([]);
  const pending = useRef(new Set()), request = useRef(0);
  const uid = useMemo(userId, []);
  const load = useCallback(async () => {
    const id = ++request.current; setLoading(true); setError('');
    try {
      const { data } = await api.get(offers ? '/order/my' : '/deal/my-deals');
      if (id === request.current) setItems(Array.isArray(data) ? data : []);
    } catch (e) { if (id === request.current) setError(e.response?.data?.message || 'Не удалось загрузить список'); }
    finally { if (id === request.current) setLoading(false); }
  }, [offers]);
  useEffect(() => { load(); return () => { request.current++; }; }, [load]);
  const myItems = items.filter(item => offers ? same(item.user?.id ?? item.user_id, uid) : same(item.buyer?.id ?? item.buyer_id, uid) || same(item.seller?.id ?? item.seller_id, uid));
  const role = item => offers ? item.type : same(item.buyer?.id ?? item.buyer_id, uid) ? 'BUY' : 'SELL';
  const active = item => offers ? item.status === 'pending' : !['COMPLETED', 'CANCELLED'].includes(item.status);
  const filtered = myItems.filter(item => {
    if (side !== 'all' && role(item) !== side) return false;
    if (status !== 'all' && (status === 'active' ? !active(item) : item.status !== status)) return false;
    const haystack = [item.id, item.order_id, item.order?.id, item.buyer?.username, item.seller?.username, item.price, item.status, offers ? orderLabels[item.status] : getDealStatusLabel(item.status)].join(' ').toLocaleLowerCase('ru');
    return haystack.includes(query.trim().replace(/^#/, '').toLocaleLowerCase('ru'));
  });
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * size, currentPage * size);
  const change = setter => event => { setter(event.target.value); setPage(1); };
  const copy = async id => { try { await navigator.clipboard.writeText(String(id)); enqueueSnackbar('Номер скопирован', { variant: 'success' }); } catch { enqueueSnackbar('Не удалось скопировать номер', { variant: 'error' }); } };
  const update = async (item, next) => {
    if (pending.current.has(item.id)) return;
    if (next === 'cancelled' && !window.confirm(`Снять объявление #${item.id}?`)) return;
    pending.current.add(item.id); setBusy([...pending.current]);
    try {
      await api.patch(`/order/${item.id}/status`, { status: next });
      enqueueSnackbar(next === 'pending' ? 'Объявление активно' : next === 'paused' ? 'Объявление на паузе' : 'Объявление снято', { variant: 'success' });
      await load();
    } catch (e) { enqueueSnackbar(e.response?.data?.message || 'Не удалось изменить объявление', { variant: 'error' }); }
    finally { pending.current.delete(item.id); setBusy([...pending.current]); }
  };
  return <main className={styles.workspace}>
    <header className={styles.heading}><div><h1>{offers ? 'Мои объявления' : 'Мои сделки'}</h1><p>{offers ? 'Управляйте публикациями, проверяйте остаток и условия.' : 'Следите за оплатой, статусом и перепиской по каждой сделке.'}</p></div>
      <Link className={styles.primary} to={offers ? '/p2p/create-order' : '/p2p/orders'}>{offers ? 'Создать объявление' : 'Открыть P2P'}</Link>
    </header>
    <div className={styles.summary}><span>Всего: <b>{myItems.length}</b></span><span>Активных: <b>{myItems.filter(active).length}</b></span>{offers && <span>На паузе: <b>{myItems.filter(item => item.status === 'paused').length}</b></span>}</div>
    <section className={styles.controls} aria-label='Фильтры списка'>
      <label>Поиск<input type='search' maxLength={160} value={query} onChange={change(setQuery)} placeholder={offers ? 'Номер, цена или статус' : 'Номер сделки, ордера или участник'} /></label>
      <label>Статус<select value={status} onChange={change(setStatus)}><option value='all'>Все статусы</option><option value='active'>Активные</option>{Object.entries(offers ? { paused: 'На паузе', completed: 'Исполненные', cancelled: 'Отменённые' } : { AWAITING_PAYMENT: 'Ожидают оплаты', PAYMENT_CONFIRMED: 'Оплата отмечена', DISPUTE: 'Споры', COMPLETED: 'Завершённые', CANCELLED: 'Отменённые' }).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>{offers ? 'Тип объявления' : 'Моя роль'}<select value={side} onChange={change(setSide)}><option value='all'>Покупка и продажа</option><option value='BUY'>Покупка USDT</option><option value='SELL'>Продажа USDT</option></select></label>
      <button type='button' disabled={loading} onClick={load}>Обновить</button>
    </section>
    {error && <p className={styles.error} role='alert'>{error} <button onClick={load}>Повторить</button></p>}
    <p className={styles.result} role='status'>{loading ? 'Обновляем список…' : `Найдено: ${filtered.length}`}</p>
    <section className={styles.list} aria-label={offers ? 'Список объявлений' : 'Список сделок'} aria-busy={loading}>
      {!loading && !error && !visible.length && <div className={styles.empty}><h2>{myItems.length ? 'По этим фильтрам ничего нет' : offers ? 'Объявлений пока нет' : 'Сделок пока нет'}</h2><p>{myItems.length ? 'Измените запрос или сбросьте фильтры.' : offers ? 'Создайте объявление для покупки или продажи USDT.' : 'Выберите объявление на P2P, чтобы начать сделку.'}</p>{myItems.length > 0 && <button onClick={() => { setQuery(''); setStatus('all'); setSide('all'); setPage(1); }}>Сбросить фильтры</button>}</div>}
      {visible.map(item => {
        const buyer = role(item) === 'BUY';
        const amount = offers ? item.available_amount ?? Math.max(Number(item.amount) - Number(item.filled_amount || 0), 0) : item.crypto_amount ?? item.order?.amount;
        const price = item.price ?? item.order?.price;
        const counterparty = buyer ? item.seller : item.buyer;
        const methods = Array.isArray(item.payment_methods) ? item.payment_methods : [];
        return <article key={item.id} className={styles.item}>
          <div className={styles.itemTop}><div><span className={buyer ? styles.buy : styles.sell}>{buyer ? 'Покупка USDT' : 'Продажа USDT'}</span><button className={styles.id} onClick={() => copy(item.id)} aria-label={`Скопировать номер ${item.id}`}>#{item.id}</button></div><span className={styles.status}>{offers ? orderLabels[item.status] || item.status : getDealStatusLabel(item.status)}</span></div>
          <dl className={styles.values}><div><dt>{offers ? 'Осталось' : 'Количество'}</dt><dd>{formatMoney(amount, 'USDT')}</dd></div><div><dt>Курс за 1 USDT</dt><dd>{formatMoney(price)}</dd></div><div><dt>{offers ? 'Лимиты сделки' : 'К оплате'}</dt><dd>{offers ? `${formatMoney(item.min_limit)} — ${formatMoney(item.max_limit)}` : formatMoney(item.fiat_amount ?? Number(amount) * Number(price))}</dd></div></dl>
          <div className={styles.meta}>{offers ? <span>Оплата: {methods.length ? methods.map(code => getPaymentMethodById(code).shortName).join(', ') : 'Не указана'}</span> : <><span>Участник: {counterparty?.username || counterparty?.email || `#${counterparty?.id ?? (buyer ? item.seller_id : item.buyer_id)}`}</span>{Number(item.p2p_fee_percent)>0&&<span>Комиссия {item.p2p_fee_percent}% · получатель получит {formatMoney(item.p2p_net_amount,'USDT')}</span>}</>}<time>{formatDateTime(item.created_at || item.createdAt || item.order?.created_at || item.order?.createdAt)}</time></div>
          <footer className={styles.actions}><Link className={styles.primary} to={`/${offers ? 'order' : 'deal'}/${item.id}`}>{offers ? 'Открыть объявление' : 'Открыть сделку и чат'}</Link>
            {offers && ['pending', 'paused'].includes(item.status) && <><button disabled={loading || busy.includes(item.id)} onClick={() => update(item, item.status === 'pending' ? 'paused' : 'pending')}>{item.status === 'pending' ? 'На паузу' : 'Возобновить'}</button><button className={styles.danger} disabled={loading || busy.includes(item.id)} onClick={() => update(item, 'cancelled')}>Снять объявление</button></>}
            {!offers && item.status === 'AWAITING_PAYMENT' && buyer && <span>После перевода отметьте оплату внутри сделки</span>}
          </footer>
        </article>;
      })}
    </section>
    {!loading && filtered.length > size && <nav className={styles.pagination} aria-label='Страницы списка'><button disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Назад</button><span>{currentPage} из {pages}</span><button disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Далее</button></nav>}
    <P2PMobileNav />
  </main>;
}

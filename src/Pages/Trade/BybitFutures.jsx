import {useEffect,useState,useRef,useCallback} from 'react';
import api from '../../api';
import styles from './BybitFutures.module.scss';

const base = '/exchange/bybit';
const sideLabel = side => side === 'Buy' ? 'Лонг' : 'Шорт';
const notice = error => error.response?.data?.message || 'Не удалось получить ответ. Проверьте состояние на Bybit.';

export function BybitFutures({isLoggedIn,login,newOrdersEnabled,active}){
  const [symbol,setSymbol] = useState('BTCUSDT');
  const [state,setState] = useState(null);
  const [key,setKey] = useState('');
  const [secret,setSecret] = useState('');
  const [side,setSide] = useState('Buy');
  const [type,setType] = useState('Limit');
  const [quantity,setQuantity] = useState('');
  const [price,setPrice] = useState('');
  const [pending,setPending] = useState(false);
  const [uncertain,setUncertain] = useState(null);
  const [error,setError] = useState('');
  const [message,setMessage] = useState('');
  const inFlight = useRef(false);
  const read = useRef(0);

  const refresh = useCallback(async(clearError=false) => {
    const sequence=++read.current;
    try{
      const {data}=await api.get(base+'/state',{params:{symbol}});
      if(sequence===read.current){
        setState({...data,symbol});
        if(clearError)setError('');
      }
    }catch(error){
      if(sequence===read.current){
        setError(notice(error));
      }
    }
  },[symbol]);

  useEffect(()=>{
    if(!isLoggedIn||!active)return;
    void refresh();
    const timer=window.setInterval(()=>{if(document.visibilityState==='visible'&&!inFlight.current)void refresh();},10000);
    return ()=>{window.clearInterval(timer);read.current++;};
  },[isLoggedIn,active,refresh]);

  async function run(work, attempted=null){
    if(inFlight.current)return;
    inFlight.current=true;
    setPending(true);
    setError('');
    setMessage('');
    try{
      await work();
      if(attempted)setUncertain(null);
    }catch(error){
      if(attempted&&(!error.response||error.response.status>=500))setUncertain(attempted);
      setError(notice(error));
    }finally{
      inFlight.current=false;
      setPending(false);
    }
  }

  function connect(event){
    event.preventDefault();
    const credentials={key:key.trim(),secret:secret.trim()};
    setKey('');
    setSecret('');
    void run(async()=>{
      await api.post(base+'/connection',credentials);
      await refresh();
    });
  }

  function operation(path,inputs,confirmation){
    if(!window.confirm(confirmation))return;
    const attempted={path,body:{...inputs,symbol,connectionId:state.connectionId,requestId:crypto.randomUUID()}};
    void send(attempted);
  }

  async function send(attempted){
    await run(async()=>{
      await api.post(base+attempted.path,attempted.body);
      setMessage('Bybit принял запрос. Проверьте итоговый статус в ордерах или позициях.');
      await refresh();
    },attempted);
  }

  const view=state?.symbol===symbol?state:null;
  const locked=pending||Boolean(uncertain);
  return <section className={styles.panel}>
    <header><h2>Фьючерсы Bybit</h2><p>Testnet · тестовый баланс и ордера вашего аккаунта Bybit.</p></header>
    {error&&<p role="alert">{error}</p>}
    {message&&<p role="status">{message}</p>}
    {!isLoggedIn?<button className={styles.primary} onClick={login}>Войти в CryptoGoblin</button>:
      <>
        {!view&&!error&&<p role="status">Загружаем Bybit…</p>}
        {view?.configured===false&&<p>Серверное подключение Bybit Testnet ещё не настроено.</p>}
        {view?.configured&&!view.connected&&<form className={styles.form} onSubmit={connect}>
          <p>Создайте ключ в аккаунте Bybit Testnet. Включите права фьючерсов Order и Position. Права Wallet оставьте выключенными.</p>
          <label>API Key<input required autoComplete="off" value={key} onChange={event=>setKey(event.target.value)}/></label>
          <label>API Secret<input type="password" required autoComplete="off" value={secret} onChange={event=>setSecret(event.target.value)}/></label>
          <button className={styles.primary} disabled={pending}>Подключить Bybit Testnet</button>
        </form>}
        {(view?.connected||state?.connected)&&<div className={styles.actions}>
          <label>Контракт<select value={symbol} disabled={locked} onChange={event=>setSymbol(event.target.value)}>
            {['BTC','ETH','SOL'].map(asset=><option value={asset+'USDT'} key={asset}>{asset}/USDT</option>)}
          </select></label>
          <button type="button" disabled={pending} onClick={()=>void refresh(true)}>Обновить</button>
          <button type="button" disabled={locked} onClick={()=>void run(async()=>{
            await api.delete(base+'/connection',{params:{connectionId:state.connectionId}});
            setState(null);
            await refresh();
          })}>Отключить</button>
        </div>}
        {uncertain&&<div className={styles.actions}>
          <p>Проверьте статус операции на Bybit. Повтор использует тот же идентификатор запроса.</p>
          <button type="button" disabled={pending} onClick={()=>void send(uncertain)}>Повторить запрос</button>
          <button type="button" disabled={pending} onClick={()=>{
            if(window.confirm('Вы проверили статус операции в аккаунте Bybit?'))setUncertain(null);
          }}>Я проверил статус</button>
        </div>}
        {view?.accountError&&<p role="alert">{view.accountError}</p>}
        {view?.connected&&!view.accountError&&<>
          <dl className={styles.balances}>
            <div><dt>Баланс USDT</dt><dd>{view.balance.usdt ?? '-'}</dd></div>
            <div><dt>Доступно для торговли, USD</dt><dd>{view.balance.availableUsd ?? '-'}</dd></div>
            <div><dt>Цена на Bybit Testnet, USDT</dt><dd>{view.ticker ?? '-'}</dd></div>
          </dl>
          {newOrdersEnabled?<form className={styles.form} onSubmit={event=>{
            event.preventDefault();
            operation('/orders',{side,type,quantity,price},`Отправить тестовый ордер ${symbol} на ${quantity}?`);
          }}>
            <h3>Новый ордер</h3>
            <p>Для режима одной позиции. Плечо и маржа используются из настроек Bybit.</p>
            <div className={styles.actions}>
              <label>Сторона<select value={side} onChange={event=>setSide(event.target.value)}><option value="Buy">Купить</option><option value="Sell">Продать</option></select></label>
              <label>Тип<select value={type} onChange={event=>setType(event.target.value)}><option value="Limit">Лимитный</option><option value="Market">Рыночный</option></select></label>
            </div>
            <label>Количество<input required inputMode="decimal" value={quantity} onChange={event=>setQuantity(event.target.value.replace(',','.'))}/></label>
            {type==='Limit'&&<label>Цена в USDT<input required inputMode="decimal" value={price} onChange={event=>setPrice(event.target.value.replace(',','.'))}/></label>}
            <button className={styles.primary} disabled={locked}>Отправить тестовый ордер</button>
          </form>:<p>Новые фьючерсные ордера отключены.</p>}
          <h3>Открытые позиции</h3>
          {view.positions.length?view.positions.map(position=><article className={styles.row} key={position.positionIdx}>
            <strong>{sideLabel(position.side)} · {position.size}</strong>
            <span>Вход {position.avgPrice} · Mark {position.markPrice} · PnL {position.unrealisedPnl} USDT</span>
            <button type="button" disabled={locked} onClick={()=>operation('/positions/close',{
              positionIdx:position.positionIdx,side:position.side,quantity:position.size,
            },`Закрыть тестовую позицию ${symbol} по рынку?`)}>Закрыть по рынку</button>
          </article>):<p>По этому контракту открытых позиций нет.</p>}
          <h3>Активные ордера</h3>
          {view.orders.length?view.orders.map(order=><article className={styles.row} key={order.orderId}>
            <strong>{order.side==='Buy'?'Покупка':'Продажа'} · {order.qty}</strong>
            <span>{order.price} USDT · исполнено {order.cumExecQty} · {order.orderStatus}</span>
            <button type="button" disabled={locked} onClick={()=>operation('/orders/cancel',{orderId:order.orderId},'Отменить тестовый ордер?')}>Отменить</button>
          </article>):<p>По этому контракту активных ордеров нет.</p>}
          {view.ordersTruncated&&<p>Показаны первые 50 ордеров. Полный список доступен в аккаунте Bybit.</p>}
        </>}
        {!view&&error&&<button type="button" disabled={pending} onClick={()=>void refresh(true)}>Обновить</button>}
      </>}
  </section>;
}

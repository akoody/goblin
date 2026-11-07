import {useCallback,useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import api from '../../api';
import {assetDecimal,atomicDecimal} from './walletAmounts.mjs';
import styles from './WalletAssets.module.scss';
export function WalletAssets({onSelect}){
 const [data,setData]=useState(null),[error,setError]=useState(''),[query,setQuery]=useState(''),[filter,setFilter]=useState('all');
 const load=useCallback(()=>api.get('/api/transactions/assets').then(r=>{setData(r.data);setError('');}).catch(()=>setError('Не удалось обновить активы. Попробуйте ещё раз.')),[]);
 useEffect(()=>{load();const timer=setInterval(()=>{if(document.visibilityState==='visible')load();},20000);return()=>clearInterval(timer);},[load]);
 const assets=data?[...data.coins,...data.tokens]:[];
 const visible=assets.filter(a=>(filter==='all'||(filter==='coin'?a.kind==='coin':a.kind==='token'))&&`${a.symbol} ${a.name} ${a.network} ${a.mint||''}`.toLowerCase().includes(query.trim().toLowerCase()));
 return <section className={styles.wallet}><header className={styles.heading}><div><h2>Мои активы</h2><p>Криптовалюта и токены на вашем балансе</p></div><Link to="/swap/create">Создать мемкоин ↗</Link></header>
 <div className={styles.toolbar}><div className={styles.filters} role="group" aria-label="Тип активов">{[['all','Все'],['coin','Криптовалюта'],['token','Токены Solana']].map(([key,label])=><button key={key} type="button" aria-pressed={filter===key} onClick={()=>setFilter(key)}>{label}</button>)}</div><label>Поиск актива<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Название, тикер или mint-адрес"/></label></div>
 {error&&<p role="alert">{error} <button type="button" onClick={load}>Обновить</button></p>}{!data&&!error&&<p role="status">Загрузка активов…</p>}
 <div className={styles.assets}>{visible.map(a=><article key={a.id} className={styles.asset}>
 <div className={styles.identity}><strong>{a.symbol}</strong><span>{a.name}</span><span>{a.network}{a.createdByYou?' · Создан вами':''}</span></div>
 <dl className={styles.amounts}><div><dt>Баланс</dt><dd>{a.kind==='token'?atomicDecimal(a.amountAtomic,a.decimals):assetDecimal(a.total)}</dd></div><div><dt>Доступно</dt><dd>{a.kind==='token'?atomicDecimal(a.amountAtomic,a.decimals):assetDecimal(a.available)}</dd></div>{a.kind==='coin'&&<div><dt>В резерве</dt><dd>{assetDecimal(a.locked)}</dd></div>}</dl>
 {a.mint?<div className={styles.tokenDetails}><span>Mint-адрес</span><code>{a.mint}</code><a href={`https://solscan.io/token/${a.mint}`} target="_blank" rel="noreferrer">Посмотреть в сети ↗</a><p>Хранение токена доступно. Его вывод и обмен могут пока не поддерживаться.</p></div>:a.action!=='readOnly'?<button type="button" className={styles.open} onClick={()=>onSelect(a.symbol)}>Открыть {a.symbol}</button>:<p className={styles.tokenDetails}>Операции с этим активом пока недоступны.</p>}
 </article>)}</div>{data&&!visible.length&&<p>{filter==='token'&&!query?'Токенов пока нет. Здесь появятся купленные и созданные монеты после подтверждения сети.':'По вашему запросу ничего не найдено.'}</p>}
 </section>;
}
export function SolanaWallet(){
 const [state,setState]=useState(null),[error,setError]=useState('');
 useEffect(()=>{api.get('/api/solana/state').then(r=>setState(r.data)).catch(()=>setError('Не удалось загрузить кошелёк Solana'));},[]);
 async function copy(){try{await navigator.clipboard.writeText(state.address);setError('Адрес скопирован');}catch{setError('Не удалось скопировать адрес. Выделите его вручную.');}}
 return <section className={styles.wallet}><h2>Кошелёк Solana</h2>{error&&<p role="status">{error}</p>}{!state&&!error&&<p role="status">Загрузка…</p>}{state&&<><dl className={styles.amounts}><div><dt>Баланс SOL</dt><dd>{assetDecimal(state.wallet?.balance)}</dd></div><div><dt>В резерве</dt><dd>{assetDecimal(state.wallet?.locked_balance)}</dd></div></dl><h3>Пополнение SOL</h3>{state.depositReady?<><p>Отправляйте только SOL в сети Solana. Депозит проходит проверку, действуют минимум и комиссия платформы.</p><code className={styles.address}>{state.address}</code><button type="button" className={styles.open} onClick={copy}>Скопировать адрес</button></>:<p>Приём SOL пока недоступен.</p>}<div className={styles.links}><Link to="/swap">Обменять SOL ↗</Link><Link to="/swap/create">Создать мемкоин ↗</Link></div><p>Вывод SOL и токенов из этого раздела пока не подключён.</p></>}</section>;
}

import {useEffect,useState} from 'react';
import api from '../../api';
import styles from './Admin.module.scss';
import {assetDecimal} from '../Profile/walletAmounts.mjs';
const tokenAmount=(value,decimals)=>{const raw=String(value||'0').padStart(Number(decimals)+1,'0');return decimals?`${raw.slice(0,-decimals)}.${raw.slice(-decimals)}`:raw;};
export function UserBalances({userId}){
 const [open,setOpen]=useState(false),[data,setData]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[refresh,setRefresh]=useState(0);
 useEffect(()=>{if(!open)return;const c=new AbortController();setLoading(true);setData(null);setError('');api.get(`/admin/wallet-users/${userId}/balances`,{signal:c.signal}).then(r=>setData(r.data)).catch(e=>{if(!c.signal.aborted)setError(e.response?.data?.message||'Не удалось загрузить балансы');}).finally(()=>{if(!c.signal.aborted)setLoading(false);});return()=>c.abort();},[open,userId,refresh]);
 return <div className={styles.userBalances}>
  <button type="button" aria-expanded={open} onClick={()=>setOpen(v=>!v)}>{open?'Скрыть кошельки':'Показать балансы'}</button>
  {open&&<>
   <button type="button" disabled={loading} onClick={()=>setRefresh(v=>v+1)}>Обновить балансы</button>
   {loading&&<p role="status">Загрузка…</p>}{error&&<p role="alert">{error}</p>}
   {data&&<>
    <p>Внутренние балансы · {new Date(data.at).toLocaleString('ru-RU')}</p>
    <div className={styles.loginSecurityTable}><table><thead><tr><th>Валюта</th><th>Всего</th><th>Доступно</th><th>Заморожено</th></tr></thead><tbody>{data.wallets.map(w=><tr key={w.currency}><td>{w.currency}</td><td>{assetDecimal(w.total)}</td><td>{assetDecimal(w.available)}</td><td>{assetDecimal(w.locked)}</td></tr>)}</tbody></table></div>
    {data.tokens.length>0&&<><h3>Токены Solana</h3>{data.tokens.map(t=><p key={t.mint} style={{overflowWrap:'anywhere'}}>{t.mint}<br/>{tokenAmount(t.amount_atomic,t.decimals)}</p>)}</>}
   </>}
  </>}
 </div>;
}
export function UserBalanceSearch(){
 const [query,setQuery]=useState(''),[users,setUsers]=useState([]),[error,setError]=useState('');
 useEffect(()=>{const c=new AbortController(),timer=setTimeout(()=>{setError('');setUsers([]);api.get('/admin/wallet-users',{params:{q:query},signal:c.signal}).then(r=>setUsers(r.data)).catch(e=>{if(!c.signal.aborted)setError(e.response?.data?.message||'Не удалось загрузить пользователей');});},300);return()=>{clearTimeout(timer);c.abort();};},[query]);
 return <section className={styles.loginSecurity}><h2>Балансы пользователей</h2><label>Поиск по имени, email или ID<input type="search" maxLength={160} value={query} onChange={e=>setQuery(e.target.value)}/></label>{error&&<p role="alert">{error}</p>}<p>Показано до 50 пользователей. Нажмите кнопку, чтобы загрузить актуальные балансы.</p>{users.map(u=><article key={u.id}><h3>{u.username} · #{u.id}</h3><UserBalances userId={u.id}/></article>)}</section>;
}

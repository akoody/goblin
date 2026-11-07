import {useEffect,useState} from 'react';
import {Navigate} from 'react-router-dom';
import api from '../../api';
import {Admin} from './Admin';
import {TransactionHistory} from '../../Components/TransactionHistory/TransactionHistory';
import {UserBalanceSearch} from './UserBalances';
import {Referrals} from './Referrals';
import styles from './Admin.module.scss';

const labels={chat:'Чаты',security:'Безопасность',p2p:'P2P-сделки',transactions:'Транзакции биржи',referrals:'Приглашения',balances:'Балансы пользователей'};
const message=e=>e.response?.data?.message||'Не удалось выполнить запрос';
function Chat({ticket}){
  const [messages,setMessages]=useState([]),[text,setText]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{
    let alive=true;setMessages([]);setError('');
    const load=()=>api.get(`/support/tickets/${ticket.id}/messages`).then(r=>{if(alive)setMessages(r.data);}).catch(e=>{if(alive)setError(message(e));});
    load();const timer=setInterval(load,5000);return()=>{alive=false;clearInterval(timer);};
  },[ticket.id]);
  async function send(e){e.preventDefault();setBusy(true);setError('');try{const r=await api.post(`/support/tickets/${ticket.id}/messages`,{text});setMessages(old=>[...old.filter(m=>m.id!==r.data.id),r.data]);setText('');}catch(e){setError(message(e));}finally{setBusy(false);}}
  return <section className={styles.loginSecurity}><h2>{ticket.subject} · #{ticket.id}</h2>{error&&<p role="alert">{error}</p>}<div role="log" aria-label="Сообщения обращения">{messages.map(m=><p key={m.id}><strong>{m.sender?.username} ({m.sender?.role==='operator'?'поддержка':'клиент'})</strong> · {new Date(m.createdAt).toLocaleString('ru-RU')}<br/>{m.text}</p>)}</div><form onSubmit={send} className={styles.depositSettings}><label>Ответ<textarea required maxLength={5000} rows={4} value={text} onChange={e=>setText(e.target.value)}/></label><button disabled={busy||!text.trim()}>Отправить</button></form></section>;
}
function HelperSection({section}){
  const [data,setData]=useState(null),[error,setError]=useState(''),[ticket,setTicket]=useState(null),[query,setQuery]=useState(''),[refresh,setRefresh]=useState(0);
  useEffect(()=>{if(section==='referrals'||section==='transactions')return;let alive=true;setData(null);setError('');const load=()=>{
    if(section==='balances')return;
    const path={chat:'/support/tickets',security:'/admin/login-ips',p2p:'/deal/admin/all',transactions:'/admin/transactions'}[section];
    api.get(path,{params:section==='security'?{q:query}:undefined}).then(r=>{if(alive)setData(r.data);}).catch(e=>{if(alive){setData(null);setError(message(e));}});
  };load();const timer=setInterval(load,15000);return()=>{alive=false;clearInterval(timer);};},[section,query,refresh]);
  if(section==='referrals')return <Referrals/>;
  if(section==='transactions')return <TransactionHistory admin title="Транзакции биржи"/>;
  if(section==='balances')return <UserBalanceSearch/>;
  async function review(id){try{await api.patch(`/admin/login-ips/${id}/review`);setRefresh(v=>v+1);}catch(e){setError(message(e));}}
  const rows=section==='security'?data?.rows:data;
  return <><section className={styles.loginSecurity}><h2>{labels[section]}</h2><button type="button" onClick={()=>setRefresh(v=>v+1)}>Обновить</button>{section==='security'&&<label>Поиск по входам<input type="search" value={query} maxLength={160} onChange={e=>setQuery(e.target.value)}/></label>}{error&&<p role="alert">{error}</p>}{!data&&!error&&<p role="status">Загрузка…</p>}
    <div className={styles.loginSecurityTable}><table><thead><tr>{(section==='chat'?['Обращение','Клиент','Статус','Непрочитано','']:section==='security'?['Аккаунт','IP','Устройство','Последний вход','Уведомление']:section==='p2p'?['Сделка','Покупатель','Продавец','Сумма USDT','Статус']:['Операция','Отправитель','Получатель','Сумма','Статус']).map((label,i)=><th key={i}>{label}</th>)}</tr></thead><tbody>
      {rows?.map(row=><tr key={row.id}>{section==='chat'?<><td>#{row.id} {row.subject}</td><td>{row.user?.username}</td><td>{row.status}</td><td>{row.unread}</td><td><button onClick={()=>setTicket(row)}>Открыть чат</button></td></>:section==='security'?<><td>{row.username}</td><td>{row.ip}</td><td>{row.device} · {row.os} · {row.browser}</td><td>{new Date(row.last_seen_at).toLocaleString('ru-RU')}</td><td>{row.is_new_ip&&!row.reviewed_at?<button onClick={()=>review(row.id)}>Просмотрено</button>:'Просмотрено'}</td></>:section==='p2p'?<><td>#{row.id}</td><td>{row.buyer?.username}</td><td>{row.seller?.username}</td><td>{row.crypto_amount}</td><td>{row.status}</td></>:<><td>{row.type} · {row.id}</td><td>{row.from}</td><td>{row.to}</td><td>{row.amount} {row.currency}</td><td>{row.status}</td></>}</tr>)}
      {rows?.length===0&&<tr><td colSpan="5">Нет записей.</td></tr>}
    </tbody></table></div></section>{section==='chat'&&ticket&&<Chat key={ticket.id} ticket={ticket}/>}</>;
}
export function StaffPanel(){
  const [access,setAccess]=useState(null),[section,setSection]=useState(''),[error,setError]=useState('');
  useEffect(()=>{let alive=true;const load=()=>api.get('/admin/access').then(r=>{if(alive){setAccess(r.data);setError('');setSection(current=>r.data.permissions.includes(current)?current:r.data.permissions[0]||'');}}).catch(e=>{if(alive){setAccess(null);setError(message(e));}});load();const timer=setInterval(load,15000);return()=>{alive=false;clearInterval(timer);};},[]);
  if(error)return <main className={styles.admin}><p role="alert">{error}</p></main>;
  if(!access)return <main className={styles.admin}>Проверяем права…</main>;
  if(access.role==='admin')return <Admin/>;
  if(access.role!=='helper')return <Navigate to="/" replace/>;
  return <main className={styles.admin}><h1>Панель хелпера</h1><nav className={styles.admin_tabs} aria-label="Разделы хелпера">{access.permissions.map(p=><button key={p} aria-pressed={section===p} onClick={()=>setSection(p)}>{labels[p]}</button>)}</nav>{section?<HelperSection key={section} section={section}/>:<p>Администратор пока не выдал права на разделы.</p>}</main>;
}

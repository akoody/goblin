import {useEffect,useState} from 'react';
import api from '../../api';
import styles from './Admin.module.scss';

export function Helpers(){
  const [data,setData]=useState({helpers:[],permissions:{}}),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [draft,setDraft]=useState({identifier:'',enabled:true,permissions:[]});
  const load=()=>api.get('/admin/helpers').then(r=>setData(r.data)).catch(()=>setError('Не удалось загрузить хелперов'));
  useEffect(()=>{load();},[]);
  async function save(event){
    event.preventDefault();setBusy(true);setError('');
    try{await api.post('/admin/helpers',draft);await load();setDraft({identifier:'',enabled:true,permissions:[]});}
    catch(e){setError(e.response?.data?.message||'Не удалось сохранить права');}
    finally{setBusy(false);}
  }
  return <section className={styles.loginSecurity}>
    <h2>Хелперы и права доступа</h2>
    <p>Укажите email или ID зарегистрированного пользователя. Без выбранных прав разделы панели недоступны. Отключение хелпера сохраняет его обычный пользовательский аккаунт.</p>
    {error&&<p role="alert">{error}</p>}
    <form className={styles.depositSettings} onSubmit={save}>
      <label>Email или ID<input required maxLength={255} value={draft.identifier} onChange={e=>setDraft({...draft,identifier:e.target.value})}/></label>
      <label><input type="checkbox" checked={draft.enabled} onChange={e=>setDraft({...draft,enabled:e.target.checked})}/>Доступ хелпера включён</label>
      <fieldset><legend>Разрешённые функции</legend>{Object.entries(data.permissions).map(([key,label])=><label key={key}><input type="checkbox" checked={draft.permissions.includes(key)} onChange={e=>setDraft({...draft,permissions:e.target.checked?[...draft.permissions,key]:draft.permissions.filter(p=>p!==key)})}/>{label}</label>)}</fieldset>
      <button type="submit" disabled={busy}>{busy?'Сохраняем…':'Сохранить хелпера и права'}</button>
    </form>
    <div className={styles.loginSecurityTable}><table><thead><tr><th>Аккаунт</th><th>Доступ</th><th>Права</th><th>Действие</th></tr></thead><tbody>{data.helpers.map(h=><tr key={h.user_id}><td>{h.username} · #{h.user_id}<br/>{h.email}</td><td>{h.enabled?'Включён':'Выключен'}</td><td>{h.permissions.map(p=>data.permissions[p]).join(', ')||'Нет разрешений'}</td><td><button type="button" disabled={busy} onClick={()=>setDraft({identifier:String(h.user_id),enabled:h.enabled,permissions:h.permissions})}>Изменить права</button></td></tr>)}{!data.helpers.length&&<tr><td colSpan="4">Хелперы ещё не назначены.</td></tr>}</tbody></table></div>
  </section>;
}

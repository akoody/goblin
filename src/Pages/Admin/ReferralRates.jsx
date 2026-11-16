import {useEffect,useRef,useState} from 'react';
import api from '../../api';
import styles from './Referrals.module.scss';

export function ReferralRates({userIds,onSaved}) {
  const [policy,setPolicy]=useState(null),[rate,setRate]=useState('50'),[selectedRate,setSelectedRate]=useState('50');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const pending=useRef(false);
  useEffect(()=>{
    const controller=new AbortController();
    api.get('/admin/referral-policy',{signal:controller.signal}).then(r=>{setPolicy(r.data);setRate(r.data.ratePercent);})
      .catch(e=>{if(!controller.signal.aborted)setError('Не удалось загрузить общую ставку');});
    return()=>controller.abort();
  },[]);
  async function save(path,payload,question) {
    if(pending.current||!window.confirm(question))return;
    pending.current=true;setBusy(true);setError('');setNotice('');
    try{
      const {data}=await api.patch(path,payload);
      if(path==='/admin/referral-policy'){setPolicy(p=>({...p,ratePercent:data.ratePercent}));setRate(data.ratePercent);}
      setNotice('Настройки процентов сохранены. Ранее начисленные суммы не изменены.');
      onSaved();
    }catch(e){setError(e.response?.data?.message||'Не удалось сохранить ставки');}
    finally{pending.current=false;setBusy(false);}
  }
  const selected=(value)=>save('/admin/referral-rates',{userIds,ratePercent:value},
    value===null?`Вернуть общую ставку ${policy?.ratePercent}% для выбранных пользователей (${userIds.length})?`:`Назначить ${value}% для выбранных пользователей (${userIds.length})?`);
  return <section className={styles.rates}>
    <h3>Проценты от дохода биржи</h3>
    <p>Процент назначается приглашающему пользователю с комиссий его приглашённых. Это не доля от суммы пополнения или сделки. Сетевые расходы не являются доходом биржи.</p>
    <p>Вознаграждение автоматически зачисляется на основной криптобаланс приглашающего, в валюте удержанной комиссии. Сетевые расходы не участвуют. Новая ставка действует только на будущие комиссии.</p>
    {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    <form data-save-confirmation="handled" className={styles.rateForm} onSubmit={e=>{e.preventDefault();save('/admin/referral-policy',{ratePercent:rate,resetOverrides:false},`Установить общую ставку ${rate}%? Индивидуальные ставки сохранятся.`);}}>
      <label>Общая ставка, %<input type="number" min="0" max="100" step="0.01" required value={rate} disabled={busy||!policy} onChange={e=>setRate(e.target.value)}/></label>
      <button disabled={busy||!policy}>Сохранить общую ставку</button>
      <button type="button" disabled={busy||!policy||!rate||Number(rate)<0||Number(rate)>100} onClick={()=>save('/admin/referral-policy',{ratePercent:rate,resetOverrides:true},`Назначить ${rate}% ВСЕМ пользователям и удалить ВСЕ индивидуальные ставки? Это действие изменит условия для всех, но не пересчитает старые начисления.`)}>Применить всем, сбросив индивидуальные</button>
    </form>
    <p>Общая ставка действует для новых и существующих пользователей без индивидуальной настройки. Значение 0% отключает вознаграждение для будущих начислений.</p>
    <form data-save-confirmation="handled" className={styles.rateForm} onSubmit={e=>{e.preventDefault();selected(selectedRate);}}>
      <label>Ставка выбранным, %<input type="number" min="0" max="100" step="0.01" required value={selectedRate} disabled={busy||!policy} onChange={e=>setSelectedRate(e.target.value)}/></label>
      <button disabled={busy||!policy||!userIds.length}>Применить выбранным ({userIds.length})</button>
      <button type="button" disabled={busy||!policy||!userIds.length} onClick={()=>selected(null)}>Вернуть выбранным общую ставку</button>
    </form>
    <p>Отметьте пользователей ниже. За раз можно изменить до 200 пользователей; выбранные ID сохраняются при переходе между страницами.</p>
  </section>;
}

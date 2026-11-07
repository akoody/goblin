import { useEffect, useState } from 'react';
import { FiMessageCircle } from 'react-icons/fi';
import { Link } from 'react-router-dom';
import { enqueueSnackbar } from 'notistack';
import api from '../../api';
import styles from '../P2P/P2PWorkspace.module.scss';
const labels = { WAITING:'Ожидает участника',READY:'Ожидает резервирования',FUNDED:'Средства в резерве',DELIVERED:'Ожидает приёмки',DISPUTED:'Открыт спор',COMPLETED:'Завершена',REFUNDED:'Возврат',CANCELLED:'Отменена' };
const filters = [['all','Все'],['waiting','Ожидают'],['active','Действуют'],['closed','Закрыты'],['unread','Новые сообщения']];

export function GuarantorDeals() {
  const [query,setQuery]=useState(''),[status,setStatus]=useState('all'),[page,setPage]=useState(1),[refresh,setRefresh]=useState(0);
  const [data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const [policy,setPolicy]=useState(null),[feeDraft,setFeeDraft]=useState('5'),[minimumDraft,setMinimumDraft]=useState('5'),[savingFee,setSavingFee]=useState(false);
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setError('');setData(null);
    const timer=setTimeout(async()=>{
      try{const response=await api.get('/api/commerce/admin/escrow',{params:{q:query,status,page},signal:controller.signal});if(!controller.signal.aborted)setData(response.data);}
      catch(e){if(!controller.signal.aborted)setError(e.response?.data?.message||'Не удалось загрузить сделки гаранта');}
      finally{if(!controller.signal.aborted)setLoading(false);}
    },250);
    return()=>{clearTimeout(timer);controller.abort();};
  },[query,status,page,refresh]);
  useEffect(()=>{let active=true;api.get('/api/commerce/admin/escrow/policy').then(({data:response})=>{if(active){setPolicy(response);setFeeDraft(String(response.feePercent));setMinimumDraft(String(response.minimumAmount));}}).catch(e=>{if(active)enqueueSnackbar(e.response?.data?.message||'Не удалось загрузить настройки гаранта',{variant:'error'});});return()=>{active=false;};},[]);
  const saveFee=async event=>{event.preventDefault();if(savingFee)return;setSavingFee(true);try{await api.patch('/api/commerce/admin/escrow/policy',{feePercent:feeDraft,minimumAmount:minimumDraft});const {data:response}=await api.get('/api/commerce/admin/escrow/policy');setPolicy(response);setFeeDraft(String(response.feePercent));setMinimumDraft(String(response.minimumAmount));enqueueSnackbar('Настройки гаранта обновлены',{variant:'success'});}catch(e){enqueueSnackbar(e.response?.data?.message||'Не удалось сохранить настройки',{variant:'error'});}finally{setSavingFee(false);}};
  const pages=Math.max(1,Math.ceil((data?.total||0)/25));
  return <section className={styles.workspace} style={{padding:'0',maxWidth:'none'}}>
    <div className={styles.heading}><div><h2>Сделки гаранта</h2><p>Все сделки, включая ожидающие, завершённые и споры. Просмотр не перемещает средства.</p></div></div>
    <form className={styles.controls} style={{gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr)) auto',marginTop:16,alignItems:'end'}} onSubmit={saveFee}>
      <label>Комиссия гаранта, %<input aria-label='Комиссия гаранта, %' type='number' min='0' max='100' step='0.01' required value={feeDraft} onChange={e=>setFeeDraft(e.target.value)} /></label>
      <label>Минимальная сумма сделки, USDT<input aria-label='Минимальная сумма сделки гаранта' type='number' min='0.000001' max='1000000' step='0.000001' required value={minimumDraft} onChange={e=>setMinimumDraft(e.target.value)} /></label>
      <button type='submit' disabled={savingFee||!policy}>{savingFee?'Сохраняем…':'Сохранить'}</button>
      <p style={{gridColumn:'1/-1',fontSize:13,color:'var(--text-muted)',margin:0,lineHeight:1.5}}>Комиссия и минимум применяются только к новым сделкам. Комиссия удерживается из выплаты продавцу после успешного завершения; возвраты и отмены без комиссии. Текущий минимум: {policy?`${policy.minimumAmount} USDT`: 'загружаем…'}.</p>
    </form>
    {!!policy?.recentFees?.length&&<section className={styles.item} style={{marginTop:16}} aria-label='Начисленные комиссии гаранта'>
      <h3 style={{margin:'0 0 12px'}}>Последние комиссии гаранта</h3>
      <div className={styles.list}>{policy.recentFees.map(fee=><article key={fee.deal_id} style={{padding:'12px 0',borderTop:'1px solid var(--border)',minWidth:0}}>
        <p className={styles.meta}>Сделка #{fee.deal_id} · {new Date(fee.created_at).toLocaleString('ru-RU')}</p>
        <p>{fee.seller_name} · сумма {fee.gross_amount} USDT · удержано {fee.fee_amount} USDT ({fee.fee_percent}%) · продавцу {fee.net_amount} USDT</p>
      </article>)}</div>
    </section>}
    <div className={styles.controls} style={{marginTop:16}}>
      <label>Поиск<input type='search' maxLength={160} value={query} placeholder='Название, ID сделки или участник' onChange={e=>{setQuery(e.target.value);setPage(1);}} /></label>
      <button disabled={loading} onClick={()=>setRefresh(value=>value+1)}>Обновить</button>
    </div>
    <nav className={styles.statusFilters} aria-label='Группы сделок гаранта'>
      {filters.map(([value,label])=><button key={value} type='button' aria-pressed={status===value} className={status===value?styles.statusFilterActive:''} disabled={loading&&status===value} onClick={()=>{setStatus(value);setPage(1);}}>{label}</button>)}
    </nav>
    {error&&<p className={styles.error} role='alert'>{error}</p>}
    <p className={styles.result} role='status'>{loading?'Загружаем сделки…':`Найдено: ${data?.total??0}`}</p>
    <div className={styles.list}>{data?.rows.map(deal=><article className={styles.item} key={deal.id}>
      <div className={styles.itemTop}><h3>{deal.title}</h3><span className={styles.status}>{labels[deal.status]||deal.status}</span></div>
      <p className={styles.meta}>#{deal.id}</p>
      <dl className={styles.values}><div><dt>Покупатель</dt><dd>{deal.buyer_name||'Не присоединился'}{deal.buyer_id?` · #${deal.buyer_id}`:''}</dd></div><div><dt>Продавец</dt><dd>{deal.seller_name||'Не присоединился'}{deal.seller_id?` · #${deal.seller_id}`:''}</dd></div><div><dt>Сумма</dt><dd>{deal.amount} {deal.currency}</dd></div></dl>
      <p className={styles.meta}>Зафиксированная комиссия при успешной выплате продавцу: {Number(deal.guarantor_fee_percent||0)}%</p>
      <p className={styles.meta}>Создана: {new Date(deal.created_at).toLocaleString('ru-RU')}{Number(deal.unread_count)>0&&<span className={styles.unread}><FiMessageCircle aria-hidden='true'/> Новых сообщений: {deal.unread_count}</span>}</p>
      <div className={styles.actions}><Link className={styles.primary} to={`/manage/commerce/deals/${deal.id}`}>Условия, участники и чат</Link></div>
    </article>)}</div>
    {data&&!data.rows.length&&<p className={styles.empty}>По этим условиям сделок нет.</p>}
    {data&&pages>1&&<nav className={styles.pagination} aria-label='Страницы сделок гаранта'><button disabled={loading||page<=1} onClick={()=>setPage(page-1)}>Назад</button><span>{page} из {pages}</span><button disabled={loading||page>=pages} onClick={()=>setPage(page+1)}>Далее</button></nav>}
  </section>;
}

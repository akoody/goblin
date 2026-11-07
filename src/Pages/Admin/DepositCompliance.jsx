import {useEffect,useState} from 'react';
import {enqueueSnackbar} from 'notistack';
import api from '../../api';
import styles from './Admin.module.scss';

const statusLabels={PENDING_AML:'Ожидает AML-проверки',PENDING_CHAIN:'Ожидает сверки сети (без AML)',BLOCKED:'Заблокирован',CREDITED:'Зачислен'};
const amountText=(value,currency='USDT')=>`${new Intl.NumberFormat('ru-RU',{maximumFractionDigits:currency==='USDT'?6:18}).format(Number(value||0))} ${currency}`;
export function DepositCompliance(){
  const [data,setData]=useState(null),[fee,setFee]=useState('2'),[withdrawalPolicy,setWithdrawalPolicy]=useState({destinationAddress:'',thresholdAmount:'100'}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[selected,setSelected]=useState(null);
  const load=async()=>{try{const [{data:next},{data:policy}]=await Promise.all([api.get('/admin/deposit-compliance'),api.get('/admin/treasury-auto-withdrawal-policy')]);setData(next);setFee(next.policy.feeUsd);setWithdrawalPolicy(policy);setError('');}catch(e){setError(e.response?.data?.message||'Не удалось загрузить депозиты и настройки вывода');}};
  useEffect(()=>{load();},[]);
  const save=async event=>{event.preventDefault();if(busy)return;setBusy(true);try{await api.patch('/admin/deposit-compliance/policy',{feeUsd:fee});await load();enqueueSnackbar('Комиссия изменена для новых депозитов',{variant:'success'});}catch(e){enqueueSnackbar(e.response?.data?.message||'Не удалось сохранить',{variant:'error'});}finally{setBusy(false);}};
  const saveWithdrawalPolicy=async event=>{event.preventDefault();if(busy)return;setBusy(true);try{const {data:policy}=await api.patch('/admin/treasury-auto-withdrawal-policy',withdrawalPolicy);setWithdrawalPolicy(policy);enqueueSnackbar('Настройки порога и адреса сохранены. Автоотправка остаётся выключенной.',{variant:'success'});}catch(e){enqueueSnackbar(e.response?.data?.message||'Не удалось сохранить настройки автовывода',{variant:'error'});}finally{setBusy(false);}};
  const review=async event=>{event.preventDefault();if(busy)return;const values=Object.fromEntries(new FormData(event.currentTarget));const action=event.nativeEvent.submitter?.value;if(action==='APPROVE'&&!window.confirm('Вы проверили внешний AML-отчёт по этой транзакции и принимаете решение о зачислении? Комиссия будет удержана один раз.'))return;setBusy(true);try{await api.post(`/admin/deposit-compliance/${selected.id}/review`,{...values,action});setSelected(null);await load();enqueueSnackbar(action==='APPROVE'?'Депозит зачислен, комиссия учтена':'Зачисление заблокировано',{variant:'success'});}catch(e){enqueueSnackbar(e.response?.data?.message||'Не удалось обработать депозит',{variant:'error'});}finally{setBusy(false);}};
  return <section className={styles.loginSecurity}>
    <h2>Общий кошелёк администраторов</h2>
    <p>Внутренний баланс комиссий, общий для всех администраторов. Средства учитываются в валюте депозита; автоматической конвертации и отправки на внешний адрес нет.</p>
    {error&&<p role="alert">{error}</p>}
    <button type="button" onClick={load} disabled={busy}>Обновить</button>
    <h3>Начисления и общий баланс</h3>
    <p>Суммы сгруппированы по валютам и не конвертируются между собой. Начисления показывают фактически проведённые операции; баланс — внутренний учёт казны.</p>
    <div className={styles.loginSecurityTable}><table><thead><tr><th>Источник</th><th>Сумма</th><th>Операций</th></tr></thead><tbody>
      {data?.income?.deposits.map(item=><tr key={`deposit-${item.currency}`}><td>Комиссии пополнений</td><td>{amountText(item.amount,item.currency)}</td><td>{item.count}</td></tr>)}
      <tr><td>Комиссии гаранта</td><td>{amountText(data?.income?.guarantor?.amount)}</td><td>{data?.income?.guarantor?.count??'…'}</td></tr>
      <tr><td>P2P-комиссии</td><td>{amountText(data?.income?.p2p?.amount)}</td><td>{data?.income?.p2p?.count??'…'}</td></tr>
      {data?.income?.total?.map(item=><tr key={`total-${item.currency}`}><td><strong>Всего начислено в казну ({item.currency})</strong></td><td><strong>{amountText(item.amount,item.currency)}</strong></td><td><strong>{item.count}</strong></td></tr>)}
      <tr><td>Регистрации по реферальным ссылкам</td><td>—</td><td>{data?.income?.referrals?.registeredCount??'…'}</td></tr>
      {data?.income?.referrals?.deposits?.map(item=><tr key={`ref-deposit-${item.currency}`}><td>Зачислено от приглашённых ({item.currency})</td><td>{amountText(item.amount,item.currency)}</td><td>{item.count}</td></tr>)}
      {data?.income?.referralPayouts?.map(item=><tr key={`referral-${item.currency}`}><td>Начислено рефералам (не доход казны)</td><td>{amountText(item.amount,item.currency)}</td><td>{item.count}</td></tr>)}
    </tbody></table></div>
    {!data?.income?.p2p?.enabled&&<p>P2P-комиссия в текущей логике не взимается, поэтому поступления равны нулю. Это не включает P2P-тариф.</p>}
    <form onSubmit={save} className={styles.depositSettings}>
      <label>Комиссия за каждое пополнение, эквивалент USDT<input type="number" aria-label="Комиссия за пополнение" min="0" max="4.99" step="0.01" required value={fee} onChange={e=>setFee(e.target.value)} /></label>
      <button disabled={busy||!data} type="submit">Сохранить комиссию</button>
    </form>
    <p>Минимум: {data?.policy.minUsd||'5'} USDT или эквивалент. Комиссия фиксируется при обнаружении депозита. Курс для других валют фиксируется при зачислении. Старые пополнения не пересчитываются.</p>
    <div className={styles.loginSecurityTable}><table><thead><tr><th>Валюта</th><th>Текущий внутренний баланс казны</th></tr></thead><tbody>{data?.balances.map(b=><tr key={b.currency}><td>{b.currency}</td><td>{amountText(b.balance,b.currency)}</td></tr>)}{data&&!data.balances.length&&<tr><td colSpan="2">Комиссии ещё не начислялись.</td></tr>}</tbody></table></div>
    <h3>Настройки автовывода комиссий</h3>
    <p>Укажите порог и адрес получателя. Настройки сохраняются для USDT в сети TRON. Автоматическая отправка сейчас выключена: баланс казны — внутренний учёт, отдельный кошелёк и серверный механизм отправки ещё не подключены.</p>
    <form onSubmit={saveWithdrawalPolicy} className={styles.depositSettings}>
      <label>Порог запуска, USDT<input type="number" min="5" max="1000000000" step="0.000001" required value={withdrawalPolicy.thresholdAmount} onChange={e=>setWithdrawalPolicy(current=>({...current,thresholdAmount:e.target.value}))} /></label>
      <label>Адрес получателя USDT (TRON)<input type="text" maxLength={255} placeholder="T…" value={withdrawalPolicy.destinationAddress} onChange={e=>setWithdrawalPolicy(current=>({...current,destinationAddress:e.target.value}))} /></label>
      <button disabled={busy||!data} type="submit">Сохранить настройки</button>
    </form>
    <p role="status">Режим: {withdrawalPolicy.enabled?'включён':'выключен'} · Порог: {amountText(withdrawalPolicy.thresholdAmount)} · Сеть: {withdrawalPolicy.network||'TRON'}</p>
    <p>Когда подключим отдельный кошелёк казны и безопасную серверную подпись транзакций, эти настройки смогут управлять реальными выплатами. Сейчас адрес и порог не инициируют перевод.</p>
    <h3>AML и очередь депозитов</h3>
    <p>{data?.policy.amlMode==='SAFIO_AUTO_LOW_RISK'?'Депозиты USDT и TRX в сети TRON с низким риском и завершённой разрешающей проверкой Safio зачисляются автоматически. Рискованные депозиты, неполные результаты и ошибки проверки передаются администратору.':'API проверки AML не настроен. Депозиты ожидают внешнего отчёта и решения администратора.'} До зачисления средства остаются вне доступного баланса.</p>
    <p role="status">Ожидают проверки: {data?.pending??'…'}</p>
    <div className={styles.loginSecurityTable}><table><thead><tr><th>Аккаунт</th><th>Депозит</th><th>Комиссия</th><th>Статус</th><th>Tx hash</th><th>Решение</th></tr></thead><tbody>{data?.deposits.map(d=><tr key={d.id}><td>{d.username} · #{d.user_id}</td><td>{d.amount} {d.currency}</td><td>{d.fee_amount??`экв. ${d.fee_usd} USDT`}</td><td>{statusLabels[d.status]||d.status}{d.risk_level==='NOT_SCREENED'&&<p>AML не выполнялся</p>}{d.chain_error&&<p>Сверка: {d.chain_error}</p>}</td><td>{d.tx_hash}</td><td>{['PENDING_AML','PENDING_CHAIN'].includes(d.status)?<button type="button" onClick={()=>setSelected(d)}>Проверить #{d.id}</button>:d.review_note}</td></tr>)}{data&&!data.deposits.length&&<tr><td colSpan="6">Депозитов на проверке нет.</td></tr>}</tbody></table></div>
    {selected&&<form className={styles.depositSettings} onSubmit={review}>
      <h3>Решение по депозиту #{selected.id}</h3><p>{selected.amount} {selected.currency} · {selected.tx_hash}</p>
      <p>Сеть: {selected.network}. Отправитель: {selected.from_address||'не определён'}. Получатель: {selected.to_address}.</p>
      <p>Проверьте сеть, хеш, получателя и источник в отчёте. Указанная ссылка сама по себе не является автоматической проверкой.</p>
      <p>Проверка Safio: {selected.aml_status||'не запускалась'}{selected.aml_check_id&&` · ${selected.aml_check_id}`}{selected.aml_error&&` · ${selected.aml_error}`}. Риск: {selected.risk_level||'не определён'}.</p>
      <label>Провайдер отчёта<input name="provider" maxLength={120} defaultValue={selected.report_provider||''} /></label>
      <label>Номер или ссылка на внешний AML-отчёт<input name="reference" maxLength={1000} defaultValue={selected.report_reference||''} /></label>
      <label>Риск по отчёту<select name="riskLevel" defaultValue={['LOW','MEDIUM','HIGH'].includes(selected.risk_level)?selected.risk_level:''}><option value="">Выберите</option><option value="LOW">Низкий</option><option value="MEDIUM">Средний — требует решения администратора</option><option value="HIGH">Высокий — зачисление запрещено</option></select></label>
      <label>Обоснование решения<textarea name="note" required minLength={10} maxLength={2000} rows={3}/></label>
      <div><button name="action" value="APPROVE" type="submit" disabled={busy}>Подтвердить по отчёту</button><button name="action" value="BLOCK" type="submit" disabled={busy}>Заблокировать зачисление</button><button type="button" onClick={()=>setSelected(null)}>Отмена</button></div>
    </form>}
    <h3>История начислений комиссий</h3>
    <div className={styles.loginSecurityTable}><table><thead><tr><th>Дата</th><th>Депозит</th><th>Аккаунт</th><th>Начислено</th><th>Тариф USDT</th></tr></thead><tbody>{data?.ledger.map(l=><tr key={l.id}><td>{new Date(l.created_at).toLocaleString('ru-RU')}</td><td>#{l.deposit_id}</td><td>{l.username} · #{l.user_id}</td><td>{l.amount} {l.currency}</td><td>{l.fee_usd}</td></tr>)}</tbody></table></div>
  </section>;
}

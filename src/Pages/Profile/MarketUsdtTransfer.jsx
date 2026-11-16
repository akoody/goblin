import {useEffect,useRef,useState} from 'react';
import api from '../../api';
import {assetDecimal} from './walletAmounts.mjs';
import styles from './Profile.module.scss';

const endpoint='/api/commerce/market-usdt';

export function MarketUsdtTransfer({onTransferred}){
  const [balances,setBalances]=useState(null);
  const [direction,setDirection]=useState('TO_MARKET');
  const [amount,setAmount]=useState('');
  const [pending,setPending]=useState(false);
  const [error,setError]=useState('');
  const [success,setSuccess]=useState(false);
  const requestKey=useRef(null);
  const submitting=useRef(false);
  useEffect(()=>{
    const controller=new AbortController();
    api.get(endpoint,{signal:controller.signal}).then(({data})=>setBalances(data.balances)).catch(()=>{
      if(!controller.signal.aborted)setError('Не удалось загрузить балансы USDT.');
    });
    return ()=>controller.abort();
  },[]);

  function resetRequest(){
    requestKey.current=null;
    setSuccess(false);
    setError('');
  }

  async function submit(event){
    event.preventDefault();
    if(submitting.current)return;
    submitting.current=true;
    setPending(true);
    setError('');
    try{
      requestKey.current ||= crypto.randomUUID();
      const {data}=await api.post(endpoint,{direction,amount,requestKey:requestKey.current});
      setBalances(data);
      setSuccess(true);
      setAmount('');
      requestKey.current=null;
      onTransferred();
    }catch(error){
      setError(error.response?.data?.message||'Не удалось подтвердить перевод. Повторите запрос.');
    }finally{
      submitting.current=false;
      setPending(false);
    }
  }

  return <form className={styles.marketUsdtTransfer} onSubmit={submit}>
    <h3>Перевод USDT между биржей и маркетом</h3>
    {balances&&<p>На бирже доступно {assetDecimal(balances.exchange)} USDT · На маркете {assetDecimal(balances.market)} USDT</p>}
    <div>
      <label>Направление<select value={direction} disabled={pending} onChange={e=>{setDirection(e.target.value);resetRequest();}}>
        <option value="TO_MARKET">С биржи на маркет</option>
        <option value="TO_EXCHANGE">С маркета на биржу</option>
      </select></label>
      <label>Сумма USDT<input value={amount} required inputMode="decimal" maxLength={15} disabled={pending}
        onChange={e=>{setAmount(e.target.value.replace(',','.'));resetRequest();}}/></label>
      <button disabled={pending||!amount}>{pending?'Переводим…':'Перевести USDT'}</button>
    </div>
    <p>Без комиссии</p>
    {error&&<p role="alert">{error}</p>}
    {success&&<p role="status">Перевод выполнен.</p>}
  </form>;
}

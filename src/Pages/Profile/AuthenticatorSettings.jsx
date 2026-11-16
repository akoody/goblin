import {useEffect,useState} from 'react';
import QRCode from 'react-qr-code';
import api from '../../api';
import styles from './AuthenticatorSettings.module.scss';

const endpoint='/api/auth/2fa';

export function AuthenticatorSettings(){
  const [status,setStatus]=useState(null);
  const [setup,setSetup]=useState(null);
  const [password,setPassword]=useState('');
  const [code,setCode]=useState('');
  const [recoveryCodes,setRecoveryCodes]=useState([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');

  useEffect(()=>{
    const controller=new AbortController();
    api.get(endpoint,{signal:controller.signal}).then(({data})=>setStatus(data)).catch(()=>{
      if(!controller.signal.aborted)setError('Не удалось загрузить настройки Authenticator.');
    });
    return ()=>controller.abort();
  },[]);

  async function submit(event){
    event.preventDefault();
    if(busy)return;
    setBusy(true);
    setError('');
    setNotice('');
    const operation=status.enabled?'disable':setup?'enable':'setup';
    const payload=operation==='setup'?{password}:operation==='enable'?{code}:{password,code};
    try{
      const {data}=await api.post(`${endpoint}/${operation}`,payload);
      if(operation==='setup')setSetup(data);
      else{
        if(typeof data.access_token!=='string'||!data.access_token)throw new Error('Missing session');
        localStorage.setItem('token',data.access_token);
        setSetup(null);
        if(operation==='enable'){
          setRecoveryCodes(data.recoveryCodes);
          setStatus({enabled:true,recoveryCount:data.recoveryCodes.length,recentRecovery:false});
        }else{
          setStatus({enabled:false,recoveryCount:0,recentRecovery:false});
          setNotice('Authenticator отключён.');
        }
      }
      setPassword('');
      setCode('');
    }catch(error){
      setError(error.response?.data?.message||'Не удалось сохранить настройки.');
      if(error.response?.data?.code==='MFA_EXPIRED')setSetup(null);
      if(operation==='disable'&&status.recentRecovery&&error.response?.data?.code==='MFA_INVALID'){
        setStatus(previous=>({...previous,recentRecovery:false}));
      }
    }finally{
      setBusy(false);
    }
  }

  async function copyCodes(){
    try{
      await navigator.clipboard.writeText(recoveryCodes.join('\n'));
      setNotice('Резервные коды скопированы.');
    }catch{
      setError('Не удалось скопировать коды. Их можно выделить и сохранить вручную.');
    }
  }

  return <section className={styles.panel}>
    <h2>Двухфакторная аутентификация</h2>
    <p>После подключения при входе в CryptoGoblin понадобится код из Authenticator или одноразовый резервный код.</p>
    {status&&<p><strong>{status.enabled?'Authenticator подключён':'Authenticator отключён'}</strong>
      {status.enabled&&<> · Резервных кодов осталось {status.recoveryCount}</>}</p>}
    {error&&<p className={styles.error} role="alert">{error}</p>}
    {notice&&<p role="status">{notice}</p>}
    {!status&&!error&&<p role="status">Загрузка…</p>}
    {recoveryCodes.length>0?<div className={styles.recovery}>
      <h3>Сохраните резервные коды</h3>
      <p>Каждый код работает один раз. После закрытия этого окна список исчезнет.</p>
      <ul>{recoveryCodes.map(item=><li key={item}><code>{item}</code></li>)}</ul>
      <div className={styles.actions}>
        <button type="button" className="green-button" onClick={copyCodes}>Скопировать</button>
        <button type="button" className={styles.secondary} onClick={()=>{setRecoveryCodes([]);setNotice('Резервные коды скрыты.');}}>Готово</button>
      </div>
    </div>:status&&<form className={styles.form} onSubmit={submit}>
      {setup&&<div className={styles.setup}>
        <div className={styles.qr}><QRCode value={setup.uri} size={160} title="QR-код для Authenticator"/></div>
        <p>Отсканируйте QR-код в приложении Authenticator или добавьте ключ вручную.</p>
        <code>{setup.setupKey}</code>
      </div>}
      {!setup&&<label>Текущий пароль<input type="password" autoComplete="current-password" required disabled={busy}
        value={password} onChange={event=>setPassword(event.target.value)}/></label>}
      {(setup||status.enabled&&!status.recentRecovery)&&<label>{setup?'Шестизначный код Authenticator':'Код Authenticator или резервный код'}
        <input value={code} onChange={event=>setCode(event.target.value)} autoComplete="one-time-code" required disabled={busy}
          inputMode={setup?'numeric':'text'} pattern={setup?'[0-9]{6}':undefined} maxLength={setup?6:40}/>
      </label>}
      <div className={styles.actions}>
        <button type="submit" className="green-button" disabled={busy}>{status.enabled?'Отключить Authenticator':setup?'Подтвердить подключение':'Подключить Authenticator'}</button>
        {setup&&<button type="button" className={styles.secondary} disabled={busy} onClick={()=>{setSetup(null);setCode('');setError('');}}>Отмена</button>}
      </div>
    </form>}
  </section>;
}

import {Outlet} from 'react-router-dom';
import content from './Content.module.scss';
import styles from './Swap.module.scss';
export function SwapLayout(){
 function startCreation(){
  const form=document.getElementById('memecoin-form');
  form?.scrollIntoView({block:'start'});
  form?.querySelector('input')?.focus({preventScroll:true});
 }
 return <main className={`${content.page} ${styles.page}`}><header className={styles.heading}><h1>Swap</h1><button type="button" className={styles.createButton} onClick={startCreation}>Создать свой мемкоин</button></header><div className={styles.panel}><Outlet/></div></main>;
}
export function SwapLoading({error,onRetry}){return <div className={styles.loading} role={error?'alert':'status'} aria-live="polite">{error||'Загрузка данных кошелька…'}{error&&<p><button type="button" onClick={()=>onRetry().catch(()=>{})}>Повторить загрузку</button></p>}</div>;}

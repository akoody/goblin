import {NavLink,Outlet} from 'react-router-dom';
import content from './Content.module.scss';
import styles from './Swap.module.scss';
export function SwapLayout(){
 return <main className={`${content.page} ${styles.page}`}><h1>Swap</h1><nav className={styles.navigation} aria-label="Разделы Swap"><NavLink to="/swap" end preventScrollReset>Обмен Solana</NavLink><NavLink to="/swap/tron" preventScrollReset>Обмен TRON</NavLink><NavLink to="/swap/create" preventScrollReset>Создать мемкоин</NavLink></nav><div className={styles.panel}><Outlet/></div></main>;
}
export function SwapLoading({error,onRetry}){return <div className={styles.loading} role={error?'alert':'status'} aria-live="polite">{error||'Загрузка данных кошелька…'}{error&&<p><button type="button" onClick={()=>onRetry().catch(()=>{})}>Повторить загрузку</button></p>}</div>;}

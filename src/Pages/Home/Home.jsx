import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowDown, FiArrowUp, FiArrowUpRight, FiShoppingBag, FiShield, FiTrendingUp, FiRepeat, FiDownload } from 'react-icons/fi';
import { SiTether } from 'react-icons/si';
import { RiBtcLine } from 'react-icons/ri';
import { PiCurrencyEth } from 'react-icons/pi';
import api from '../../api';
import styles from './Home.module.scss';
import { formatAssetAmount, getBalanceValue } from '../../utils/wallets';
import {assetDecimal,atomicDecimal} from '../Profile/walletAmounts.mjs';

const assets = [
  { symbol: 'USDT', name: 'Tether', icon: <SiTether /> },
  { symbol: 'BTC', name: 'Bitcoin', icon: <RiBtcLine /> },
  { symbol: 'ETH', name: 'Ethereum', icon: <PiCurrencyEth /> },
  { symbol: 'TRX', name: 'TRON', icon: <FiRepeat /> },
];
const services = [
  { to: '/trade', title: 'Торговля', description: 'Спот и фьючерсы. Графики, цены и стакан.', icon: <FiTrendingUp /> },
  { to: '/p2p/orders', title: 'P2P', description: 'Покупка и продажа USDT между пользователями.', icon: <FiRepeat />, feature: 'p2p' },
  { to: '/market', title: 'Маркет', description: 'Игры, подписки и цифровые товары.', icon: <FiShoppingBag />, feature: 'market' },
  { to: '/guarantor', title: 'Гарант', description: 'Сделки с резервированием средств до завершения.', icon: <FiShield />, feature: 'guarantor' },
];

export const Home = () => {
  const signedIn = Boolean(localStorage.getItem('token'));
  const [balances, setBalances] = useState(null);
  const [activeDeals, setActiveDeals] = useState(null);
  const [features, setFeatures] = useState({ p2p: true, market: true, guarantor: true });
  const [balanceError, setBalanceError] = useState(false);
  const [inventory,setInventory]=useState(null);
  const [inventoryError,setInventoryError]=useState(false);
  useEffect(() => {
    document.title = 'CryptoGoblin — Главная';
    let active = true;
    api.get('/api/features').then(({ data }) => { if (active) setFeatures(data); }).catch(() => {});
    if (signedIn) {
      api.get('/api/transactions/assets').then(({data})=>{if(active)setInventory(data);}).catch(()=>{if(active)setInventoryError(true);});
      api.get('/api/transactions/balance').then(({ data }) => { if (active) setBalances(data); }).catch(() => { if (active) setBalanceError(true); });
      api.get('/deal/my-deals').then(({ data }) => {
        if (active) setActiveDeals(Array.isArray(data) ? data.filter(deal => !['COMPLETED', 'CANCELLED'].includes(deal.status)).length : null);
      }).catch(() => {});
    }
    return () => { active = false; };
  }, [signedIn]);
  return <main className={styles.home}>
    <div className={styles.pageHeading}>
      <div><h1>{signedIn ? 'Обзор аккаунта' : 'CryptoGoblin'}</h1><p>{signedIn ? 'Кошелёк, торговля и ваши сделки.' : 'Криптовалютная биржа и маркет цифровых товаров.'}</p></div>
      <Link to='/download' className={styles.download}><FiDownload /> Приложение для Android</Link>
    </div>
    <section className={styles.overview}>
      <div className={styles.account}>
        {signedIn ? <>
          <h2>Баланс USDT</h2>
          <strong className={styles.balance}>{inventory ? `${assetDecimal(inventory.coins.find(a=>a.symbol==='USDT')?.total||'0')} USDT` : balanceError ? 'Недоступен' : balances ? `${formatAssetAmount(getBalanceValue(balances,'USDT'),6)} USDT` : 'Загружаем…'}</strong>
          <p>Остальные активы — ниже, каждый в своей валюте. Пересчёт общей стоимости пока недоступен.</p>
          <div className={styles.buttons}><Link to='/me' className={styles.primary}><FiArrowDown /> Пополнить</Link><Link to='/me'><FiArrowUp /> Вывести</Link></div>
        </> : <>
          <h2>Начните с биржи</h2>
          <p>Цены, графики и стакан доступны без регистрации. Для операций и хранения активов нужен аккаунт.</p>
          <div className={styles.buttons}><Link to='/trade' className={styles.primary}>Открыть биржу <FiArrowUpRight /></Link><Link to='/signin'>Создать аккаунт</Link></div>
        </>}
      </div>
      <div className={styles.services} aria-label='Сервисы'>
        {services.filter(item => !item.feature || features[item.feature]).map(item => <Link to={item.to} reloadDocument={item.to === '/market'} key={item.to}>
          <span className={styles.serviceIcon}>{item.icon}</span><div><h2>{item.title}</h2><p>{item.description}</p></div><FiArrowUpRight />
        </Link>)}
      </div>
    </section>
    <section className={styles.details}>
      {signedIn ? <div className={styles.assets}>
        <div className={styles.sectionHeading}><h2>Ваши активы</h2><Link to='/me'>Кошелёк <FiArrowUpRight /></Link></div>
        <div className={styles.assetHead}><span>Актив</span><span>Доступно</span></div>
        {inventoryError&&<p role="alert">Не удалось загрузить полный список активов. Откройте кошелёк или обновите страницу.</p>}
        {!inventory&&!inventoryError&&<p role="status">Загрузка активов…</p>}
        {inventory&&[...inventory.coins,...inventory.tokens].map(asset=><div className={styles.asset} key={asset.id}>
          <span className={styles.assetIcon} aria-hidden="true">{assets.find(a=>a.symbol===asset.symbol)?.icon||<FiRepeat/>}</span><div className={styles.assetName}><strong>{asset.symbol}</strong><p>{asset.name} · {asset.network}</p>{asset.mint&&<p className={styles.mint}>{asset.mint}</p>}</div><b>{asset.kind==='token'?atomicDecimal(asset.amountAtomic,asset.decimals):assetDecimal(asset.available)}</b>
        </div>)}
      </div> : <div className={styles.getStarted}>
        <h2>Как устроен сервис</h2>
        <ol><li><span>01</span><div><h3>Создайте аккаунт</h3><p>Один аккаунт для биржи, маркета и гаранта.</p></div></li><li><span>02</span><div><h3>Выберите операцию</h3><p>Торговля криптовалютой, цифровые товары или сделка через гаранта.</p></div></li><li><span>03</span><div><h3>Следите за сделкой</h3><p>История операций и переписка доступны в личном кабинете.</p></div></li></ol>
      </div>}
      <aside className={styles.help}>
        <h2>{signedIn ? 'Ваши сделки' : 'Перед первой сделкой'}</h2>
        {signedIn && <Link className={styles.deals} to='/p2p/my-deals'><span>Активные P2P-сделки</span><strong>{activeDeals ?? '—'}</strong><FiArrowUpRight /></Link>}
        <p>Перед оплатой сверяйте реквизиты, сумму и условия. Не переносите переписку по сделке в сторонние каналы.</p>
        <Link to='/help'>Связаться с поддержкой <FiArrowUpRight /></Link>
      </aside>
    </section>
    <footer className={styles.footer}><span>© {new Date().getFullYear()} CryptoGoblin</span><Link to='/help'>Помощь</Link><Link to='/download'>Приложение</Link></footer>
  </main>;
};

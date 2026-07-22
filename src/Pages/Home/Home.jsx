import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { NumericFormat } from "react-number-format";
import {
  FaArrowDown,
  FaArrowUp,
  FaMinus,
  FaPlus,
  FaShieldAlt,
} from "react-icons/fa";
import { FiArrowUpRight, FiClock, FiRefreshCw } from "react-icons/fi";
import { SiTether } from "react-icons/si";
import { RiBtcLine } from "react-icons/ri";
import { PiCurrencyEth } from "react-icons/pi";
import bg from "../../assets/images/Group 756.png";
import api from "../../api";
import styles from "./Home.module.scss";
import { formatAssetAmount, getBalanceValue } from "../../utils/wallets";

const actions = [
  { label: "Торговать", icon: <FaPlus />, to: "/trade", tone: "primary" },
  { label: "P2P рынок", icon: <FaMinus />, to: "/p2p/orders", tone: "primary" },
  { label: "Процессинг", icon: <FaShieldAlt />, to: "/processing", tone: "primary" },
  { label: "NFT-подарки", icon: <FaShieldAlt />, to: "/nft-gifts", tone: "primary" },
  { label: "Пополнить", icon: <FaArrowDown />, to: "/me", tone: "neutral" },
  { label: "Вывести", icon: <FaArrowUp />, to: "/me", tone: "neutral" },
];

const assetRows = [
  { symbol: "USDT", name: "Tether", icon: <SiTether />, tone: "usdt" },
  { symbol: "BTC", name: "Bitcoin", icon: <RiBtcLine />, tone: "btc" },
  { symbol: "ETH", name: "Ethereum", icon: <PiCurrencyEth />, tone: "eth" },
];

const news = [
  {
    title: "Проверяйте реквизиты перед оплатой",
    text: "Сверяйте банк, ФИО и сумму внутри сделки. Не переносите переписку в сторонние каналы.",
    date: "Сегодня",
  },
  {
    title: "P2P рынок обновлен",
    text: "Ордера теперь удобнее читать на телефоне: важные параметры вынесены в карточки.",
    date: "28 мая",
  },
  {
    title: "Поддержка в сделках",
    text: "Если статус завис, открывайте чат поддержки и прикладывайте подтверждение платежа.",
    date: "27 мая",
  },
];

export const Home = () => {
  const [balance, setBalance] = useState(0);
  const [balanceDetails, setBalanceDetails] = useState(null);
  const [activeDeals, setActiveDeals] = useState(0);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 6) return "Доброй ночи";
    if (hour < 12) return "Доброе утро";
    if (hour < 18) return "Добрый день";
    return "Добрый вечер";
  }, []);

  useEffect(() => {
    document.title = "Главная - Goblin";

    Promise.allSettled([
      api.get("/api/transactions/balance"),
      api.get("/deal/my-deals"),
    ]).then(([balanceResponse, dealsResponse]) => {
      if (balanceResponse.status === "fulfilled") {
        setBalanceDetails(balanceResponse.value.data);
        setBalance(balanceResponse.value.data.generalBalance || 0);
      } else {
        setBalance(0);
      }

      if (dealsResponse.status === "fulfilled") {
        const deals = Array.isArray(dealsResponse.value.data) ? dealsResponse.value.data : [];
        setActiveDeals(
          deals.filter((deal) => !["COMPLETED", "CANCELLED"].includes(deal.status)).length
        );
      }
    });
  }, []);

  return (
    <main className={styles.home}>
      <img src={bg} className="background" alt="" />

      <section className={styles.home_hero}>
        <div className={styles.home_hero_balance}>
          <div className={styles.home_hero_intro}>
            <p>{greeting}</p>
          </div>

          <div className={styles.home_balanceCard}>
            <div className={styles.home_balanceCard_top}>
              <span>Общий баланс</span>
              <FiRefreshCw />
            </div>
            <strong>
              <NumericFormat
                value={balance || 0}
                displayType="text"
                thousandSeparator=" "
                decimalScale={2}
                fixedDecimalScale
              />{" "}
              $
            </strong>
            <p>Доступно для операций в кошельке и P2P.</p>
          </div>
        </div>

        <div className={styles.home_actionsPanel}>
          <div className={styles.home_actionsHeader}>
            <p>Быстрые действия</p>
            <span>Основные операции с кошельком и P2P</span>
          </div>
          <div className={styles.home_actions}>
            {actions.map((action) => (
              <Link
                key={action.label}
                to={action.to}
                className={`${styles.home_action} ${
                  action.tone === "primary" ? styles.home_action_primary : ""
                }`}
              >
                <span>{action.icon}</span>
                {action.label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.home_grid}>
        <div className={styles.home_panel}>
          <div className={styles.home_panelHeader}>
            <div>
              <p>Активы</p>
              <h2>Портфель</h2>
            </div>
            <Link to="/me">
              Кошелек <FiArrowUpRight />
            </Link>
          </div>

          <div className={styles.home_assets}>
            {assetRows.map((asset) => (
              <div key={asset.symbol} className={styles.home_asset}>
                <span className={styles[`home_asset_${asset.tone}`]}>
                  {asset.icon}
                </span>
                <div>
                  <strong>{asset.symbol}</strong>
                  <p>{asset.name}</p>
                </div>
                <b>{formatAssetAmount(getBalanceValue(balanceDetails, asset.symbol), 8)}</b>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.home_panel}>
          <div className={styles.home_panelHeader}>
            <div>
              <p>P2P</p>
              <h2>Операционный статус</h2>
            </div>
            <Link to="/p2p/orders">
              Рынок <FiArrowUpRight />
            </Link>
          </div>

          <div className={styles.home_statusGrid}>
            <div>
              <FiClock />
              <strong>{activeDeals}</strong>
              <span>активных сделок</span>
            </div>
            <div>
              <FaShieldAlt />
              <strong>100%</strong>
              <span>контроль статуса</span>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.home_news}>
        <div className={styles.home_panelHeader}>
          <div>
            <p>Обновления</p>
            <h2>Новости и подсказки</h2>
          </div>
        </div>

        <div className={styles.home_newsGrid}>
          {news.map((item) => (
            <article key={item.title} className={styles.home_newsCard}>
              <span>{item.date}</span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
};

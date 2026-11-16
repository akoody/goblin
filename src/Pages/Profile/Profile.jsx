// Личный кабинет: навигация по разделам и выбор раздела из ?section=.
import React, { useEffect, useState } from "react";
import { ProfileStats } from './ProfileStats';
import { AuthenticatorSettings } from './AuthenticatorSettings';
import { TransactionHistory } from '../../Components/TransactionHistory/TransactionHistory';
import { useSearchParams } from "react-router-dom";
import styles from "./Profile.module.scss";
import { BiExit, BiGitBranch, BiShield, BiWallet } from "react-icons/bi";
import { GrTransaction } from "react-icons/gr";
import { FaChartBar, FaChevronDown } from "react-icons/fa";
import { BsClock, BsCoin } from "react-icons/bs";
import { WalletAssets, SolanaWallet } from "./WalletAssets";
import { PaymentMethods } from "./PaymentMethods";
import { ProfileTransaction } from "./ProfileTransfer";
import { Referral } from "./Referral";
import { Action } from "./WalletAction";

const walletCurrencies = ["BTC", "ETH", "USDT", "TRX"];

export const Profile = () => {
  const [searchParams] = useSearchParams();
  const [page, setPage] = React.useState("assets");
  const [navigationOpen, setNavigationOpen] = useState(false);

  useEffect(() => {
    const requestedSection = searchParams.get("section");
    if (requestedSection === "assets" || [...walletCurrencies,"SOL"].includes(requestedSection) || navigationItems.some((item) => item.key === requestedSection)) {
      setPage(requestedSection);
    }
  }, [searchParams]);



  return (
    <div className={styles.profile}>
      <section className={styles.profile_header}>
        <div>
          <h1 className="h1 title">Кошелек и профиль</h1>
          <p>
            Управление балансами, переводами, историей транзакций, способами
            оплаты и реферальной системой.
          </p>
        </div>
      </section>
      <nav
        className={`${styles.profile_navigation} ${
          navigationOpen ? styles.profile_navigation_open : ""
        }`}
        aria-label="Разделы кошелька и профиля"
      >
        <button
          type="button"
          className={styles.profile_navigation_item_active}
          onClick={() => setNavigationOpen((prev) => !prev)}
          aria-expanded={navigationOpen}
        >
          {navigationItems.find((item) => item.key == page)?.icon || <BsCoin />}
          {navigationItems.find((item) => item.key == page)?.name ||
            (page === "assets" ? "Активы" : `Действия с ${page}`)}{" "}
          <FaChevronDown />
        </button>
        <button type="button" className={page === "assets" ? styles.profile_navigation_item_active : styles.profile_navigation_item} onClick={()=>{setPage("assets");setNavigationOpen(false);}}><BiWallet/>Активы</button>
        {navigationItems.map((item) => (
          <button
            type="button"
            key={item.id}
            className={
              page == item.key
                ? styles.profile_navigation_item_active
                : styles.profile_navigation_item
            }
            onClick={() => {
              setPage(item.key);
              setNavigationOpen(false);
            }}
          >
            {item.icon} {item.name}
          </button>
        ))}
        <button
          type="button"
          className={styles.profile_navigation_item}
          onClick={() => {
                import('../../session').then(({signOut})=>signOut());
          }}
        >
          <BiExit /> Выйти
        </button>
      </nav>
      <div
        className={`${styles.profile_content} ${
          navigationOpen ? styles.profile_content_blur : ""
        }`}
      >
        {page === "assets" ? <WalletAssets onSelect={currency=>{setPage(currency);setNavigationOpen(false);}}/> : page === "SOL" ? <><button type="button" onClick={()=>setPage("assets")}>← Все активы</button><SolanaWallet/></> : navigationItems?.find((item) => item.key == page)?.page || <><button type="button" onClick={()=>setPage("assets")}>← Все активы</button><Action key={page} currency={page}/></>}
      </div>
    </div>
  );
};

const navigationItems = [
  {
    name: "Безопасность",
    id: 6,
    key: "security",
    icon: <BiShield />,
    page: <AuthenticatorSettings />,
  },
  {
    name: "Перевод",
    id: 1,
    key: "transaction",
    icon: <GrTransaction />,
    page: <ProfileTransaction />,
  },
  {
    name: "Статистика",
    id: 2,
    key: "statistics",
    icon: <FaChartBar />,
    page: <ProfileStats />,
  },
  {
    name: "История транзакций",
    id: 3,
    key: "transactions",
    icon: <BsClock />,
    page: <TransactionHistory />,
  },
  {
    name: "Способы оплаты",
    id: 4,
    key: "payment-methods",
    icon: <BiWallet />,
    page: <PaymentMethods />,
  },
  {
    name: "Реферальная система",
    icon: <BiGitBranch />,
    id: 5,
    key: "referral",
    page: <Referral />,
  },
];

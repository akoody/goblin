import React, { useEffect, useState } from "react";
import styles from "./Header.module.scss";
import goblin from "../../assets/images/Гоблин 2.svg";
import { Link, NavLink } from "react-router-dom";
import { FaPhone, FaUser } from "react-icons/fa";
import { Loader } from "../Loader/Loader";
import api from "../../api";
import { isAdminEmail } from "../../utils/adminAccess";
import { formatAssetAmount, getWalletAmount } from "../../utils/wallets";
import {
  FiArrowRight,
  FiCheck,
  FiClock,
  FiCopy,
  FiCreditCard,
  FiLogOut,
  FiMail,
  FiMenu,
  FiMessageCircle,
  FiUser,
  FiUserCheck,
  FiX,
} from "react-icons/fi";

const navItems = [
  {to:'/swap',label:'Swap'},
  {to:'/bonuses',label:'Бонусы'},
  {to:'/news',label:'Новости'},
  {to:'/about',label:'О проекте'},
  { to: "/trade", label: "Торговля" },
  { to: "/market", label: "Маркет" },
  { to: "/guarantor", label: "Гарант" },
  { to: "/download", label: "Приложение" },
  { to: "/p2p/orders", label: "P2P" },
  { to: "/processing", label: "Процессинг" },
  { to: "/nft-gifts", label: "NFT-подарки" },
  { to: "/p2p/my-deals", label: "Сделки" },
  { to: "/p2p/my-offers", label: "Объявления" },
  { to: "/me", label: "Кошелек" },
  { to: "/p2p/profile", label: "Профиль" },
  { to: "/help", label: "Помощь" },
];

const adminNavItem = { to: "/admin", label: "Админ" };

const supportPhone = {
  display: "+7 800 555-35-35",
  href: "tel:+78005553535",
  raw: "+78005553535",
};
const supportEmail = "support@goblin-p2p.com";

export const Header = () => {
  const [user, setUser] = useState();
  const [features, setFeatures] = useState({ p2p: true, processing: true, nft: true, market:true,guarantor:true });
  const [loading, setLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [phoneCopied, setPhoneCopied] = useState(false);
  const token = localStorage.getItem("token");
  const hasStaffPanel=['admin','helper'].includes(user?.staffAccess?.role);
  const visibleNavItems = (hasStaffPanel ? [...navItems, {...adminNavItem,label:user?.staffAccess?.role==='helper'?'Хелпер':'Админ'}] : navItems)
    .filter((item) => {
      if (item.to.startsWith("/p2p/") && item.to !== "/p2p/profile") return features.p2p;
      if (item.to === "/processing") return features.processing;
      if (item.to === "/nft-gifts") return features.nft;
      if (item.to === '/market')return features.market||isAdminEmail(user?.email);
      if (item.to === '/guarantor')return features.guarantor||isAdminEmail(user?.email);
      return true;
    });
  const walletBalances = ["BTC", "ETH", "USDT", "TRX", "SOL"].map((currency) => ({
    currency,
    value: getWalletAmount(user?.wallets, currency),
    precision: currency === 'SOL' ? 9 : currency === "BTC" || currency === "ETH" ? 8 : 6,
  }));
  const primaryNavItems = visibleNavItems.filter(item => ['/trade', '/market', '/guarantor', '/p2p/orders', '/me'].includes(item.to));

  const loadUser = React.useCallback(({ showLoader = false } = {}) => {
    if (!token) return;

    if (showLoader) setLoading(true);
    api
      .get(`/api/auth/me`)
      .then((response) => {
        setUser(response.data);
      })
      .catch((err) => {
        if (err.response?.status == 401) {
          localStorage.removeItem("token");
          window.location.reload();
        }
      })
      .finally(() => {
        if (showLoader) setLoading(false);
      });
  }, [token]);

  useEffect(() => {
    if (!token) return undefined;

    loadUser({ showLoader: true });
    const refreshId = window.setInterval(loadUser, 15_000);
    window.addEventListener("focus", loadUser);

    return () => {
      window.clearInterval(refreshId);
      window.removeEventListener("focus", loadUser);
    };
  }, [loadUser, token]);

  useEffect(() => {
    let active = true;
    const refresh=()=>api.get("/api/features")
      .then((response) => {
        if (active) setFeatures((current) => ({ ...current, ...response.data }));
      })
      .catch(() => undefined);
    refresh();
    const timer=window.setInterval(refresh,15000);
    window.addEventListener('focus',refresh);
    return () => { active = false;window.clearInterval(timer);window.removeEventListener('focus',refresh); };
  }, []);

  useEffect(() => {
    if (!profileOpen && !menuOpen) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setProfileOpen(false);
        setMenuOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen, profileOpen]);

  useEffect(() => {
    if (!supportOpen) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setSupportOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [supportOpen]);

  const copySupportPhone = async () => {
    if (!navigator.clipboard) {
      return;
    }

    try {
      await navigator.clipboard.writeText(supportPhone.raw);
      setPhoneCopied(true);
      window.setTimeout(() => setPhoneCopied(false), 1800);
    } catch (error) {
      setPhoneCopied(false);
    }
  };

  const handleLogout = async () => { const { signOut }=await import('../../session');await signOut(); };

  return (
    <header className={styles.header}>
      {loading && <Loader />}
      <Link to="/" className={styles.header_logo}>
        <img src={goblin} alt="Гоблин" />
        <span>Гоблин</span>
      </Link>
      <nav className={styles.header_links} aria-label="Основная навигация">
        {primaryNavItems.map((item) => (
          <NavLink
            key={item.to}
            className={({ isActive }) =>
              `${styles.header_links_item} ${
                isActive ? styles.header_links_item_active : ""
              }`
            }
            to={item.to}
            reloadDocument={item.to.startsWith('/market')}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className={`${styles.header_links} ${styles.header_contacts}`}>
        <button
          type="button"
          aria-label="Открыть поддержку"
          onClick={() => setSupportOpen(true)}
        >
          <FaPhone style={{ transform: "rotate(90deg)" }} />
        </button>{" "}
        {!token && <Link to="/login">Войти</Link>}
      </div>
      <button
        className={styles.header_menuButton}
        type="button"
        aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"}
        aria-expanded={menuOpen}
        aria-controls="site-menu"
        onClick={() => {
          setProfileOpen(false);
          setMenuOpen((prev) => !prev);
        }}
      >
        {menuOpen ? <FiX /> : <FiMenu />}
        <span>Ещё</span>
      </button>
      <button
        className={styles.header_mobileProfileButton}
        type="button"
        aria-label={profileOpen ? "Закрыть профиль" : "Открыть профиль"}
        aria-expanded={profileOpen}
        onClick={() => {
          setMenuOpen(false);
          setProfileOpen((prev) => !prev);
        }}
      >
        <FaUser />
      </button>
      <div
        id="site-menu"
        className={`${styles.header_mobilePanel} ${
          menuOpen ? styles.header_mobilePanel_open : ""
        }`}
      >
        <nav aria-label="Мобильная навигация">
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.to}
              className={({ isActive }) =>
                `${styles.header_mobilePanel_item} ${
                  isActive ? styles.header_mobilePanel_item_active : ""
                }`
              }
              to={item.to}
            reloadDocument={item.to.startsWith('/market')}
              onClick={() => setMenuOpen(false)}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button
          type="button"
          className={styles.header_mobileSupport}
          onClick={() => {
            setMenuOpen(false);
            setSupportOpen(true);
          }}
        >
          <FaPhone style={{ transform: "rotate(90deg)" }} />
          Связаться с поддержкой
        </button>
      </div>
      <div
        className={`${styles.header_mobileProfilePanel} ${
          profileOpen ? styles.header_mobileProfilePanel_open : ""
        }`}
      >
        {!token && <nav><Link to="/login" onClick={() => setProfileOpen(false)}>Войти</Link><Link to="/signin" onClick={() => setProfileOpen(false)}>Создать аккаунт</Link></nav>}
        {user && (
          <>
            <div className={styles.header_mobileProfileInfo}>
              <span>
                <FaUser />
              </span>
              <div>
                <strong>{user?.email}</strong>
                <p>Аккаунт</p>
              </div>
            </div>

            <div className={styles.header_mobileProfileBalances}>
              {walletBalances.map((wallet) => (
                <section key={wallet.currency}>
                  <p>{wallet.currency}</p>
                  <strong>{formatAssetAmount(wallet.value, wallet.precision)}</strong>
                </section>
              ))}
            </div>

            <nav aria-label="Мобильное меню аккаунта">
              <Link to="/me" onClick={() => setProfileOpen(false)}>
                <FiCreditCard />
                Кошелек
              </Link>
              <Link to="/p2p/profile" onClick={() => setProfileOpen(false)}>
                <FiUser />
                Профиль
              </Link>
              {hasStaffPanel && (
                <Link to="/admin" onClick={() => setProfileOpen(false)}>
                  <FiUserCheck />
                  Админ-панель
                </Link>
              )}
            </nav>

            <button type="button" onClick={handleLogout}>
              <FiLogOut />
              Выйти
            </button>
          </>
        )}
      </div>
      {supportOpen && (
        <div
          className={styles.header_supportOverlay}
          role="presentation"
          onMouseDown={() => setSupportOpen(false)}
        >
          <section
            className={styles.header_supportModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="support-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className={styles.header_supportTop}>
              <div>
                <p>Поддержка</p>
                <h2 id="support-title">Связь с поддержкой</h2>
              </div>
              <button
                type="button"
                aria-label="Закрыть поддержку"
                onClick={() => setSupportOpen(false)}
              >
                <FiX />
              </button>
            </div>

            <div className={styles.header_supportStatus}>
              <span>
                <FiClock />
              </span>
              <div>
                <strong>Поддержка по обращениям</strong>
                <p>Опишите вопрос и приложите детали сделки.</p>
              </div>
            </div>

            <div className={styles.header_supportPhone}>
              <span>
                <FaPhone style={{ transform: "rotate(90deg)" }} />
              </span>
              <div>
                <p>Горячая линия</p>
                <strong>{supportPhone.display}</strong>
                <small>Для срочных вопросов по сделкам и платежам.</small>
              </div>
              <div className={styles.header_supportPhoneButtons}>
                <a href={supportPhone.href}>Позвонить</a>
                <button type="button" onClick={copySupportPhone}>
                  {phoneCopied ? <FiCheck /> : <FiCopy />}
                  {phoneCopied ? "Скопировано" : "Скопировать"}
                </button>
              </div>
            </div>

            <div className={styles.header_supportActions}>
              <Link to="/help" onClick={() => setSupportOpen(false)}>
                <span>
                  <FiMessageCircle />
                </span>
                <div>
                  <strong>Открыть чат</strong>
                  <p>Для вопросов по сделкам, оплате и аккаунту.</p>
                </div>
                <FiArrowRight />
              </Link>
              <a href={`mailto:${supportEmail}`}>
                <span>
                  <FiMail />
                </span>
                <div>
                  <strong>Написать на почту</strong>
                  <p>{supportEmail}</p>
                </div>
                <FiArrowRight />
              </a>
            </div>
          </section>
        </div>
      )}
    </header>
  );
};

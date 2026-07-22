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
  { to: "/trade", label: "Торговля" },
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
  const [loading, setLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [phoneCopied, setPhoneCopied] = useState(false);
  const token = localStorage.getItem("token");
  const visibleNavItems = isAdminEmail(user?.email)
    ? [...navItems, adminNavItem]
    : navItems;
  const walletBalances = ["BTC", "ETH", "USDT", "TRX"].map((currency) => ({
    currency,
    value: getWalletAmount(user?.wallets, currency),
    precision: currency === "BTC" || currency === "ETH" ? 8 : 2,
  }));

  useEffect(() => {
    if (token) {
      setLoading(true);
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
        .finally(() => setLoading(false));
    }
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

  const handleLogout = () => {
    localStorage.clear();
    window.location.reload();
  };

  return (
    <header className={styles.header}>
      {loading && <Loader />}
      <Link to="/" className={styles.header_logo}>
        <img src={goblin} alt="Гоблин" />
        <span>Гоблин</span>
      </Link>
      <nav className={styles.header_links} aria-label="Основная навигация">
        {visibleNavItems.map((item) => (
          <NavLink
            key={item.to}
            className={({ isActive }) =>
              `${styles.header_links_item} ${
                isActive ? styles.header_links_item_active : ""
              }`
            }
            to={item.to}
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
        <Link to={"/me"}>
          <FaUser />
        </Link>
        {user && (
          <div className={styles.header_user}>
            <p>{user?.email}</p>
            <div>
              {walletBalances.map((wallet) => (
                <section key={wallet.currency}>
                  {formatAssetAmount(wallet.value, wallet.precision)} <span>{wallet.currency}</span>
                </section>
              ))}
            </div>
          </div>
        )}
      </div>
      <button
        className={styles.header_menuButton}
        type="button"
        aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"}
        onClick={() => {
          setProfileOpen(false);
          setMenuOpen((prev) => !prev);
        }}
      >
        {menuOpen ? <FiX /> : <FiMenu />}
      </button>
      <button
        className={styles.header_mobileProfileButton}
        type="button"
        aria-label={profileOpen ? "Закрыть профиль" : "Открыть профиль"}
        onClick={() => {
          setMenuOpen(false);
          setProfileOpen((prev) => !prev);
        }}
      >
        <FaUser />
      </button>
      <div
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
              {isAdminEmail(user?.email) && (
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
                <strong>Операторы на связи</strong>
                <p>Обычно отвечаем в течение нескольких минут.</p>
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

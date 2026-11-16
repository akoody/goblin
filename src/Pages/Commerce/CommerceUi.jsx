// Общие блоки страниц маркета и гаранта: состояние загрузки, каркас страницы, вход, список сделок.
import { Link, NavLink } from "react-router-dom";
import { FiShoppingBag, FiShield, FiArrowRight } from "react-icons/fi";
import styles from "./Commerce.module.scss";
import { date, labels, money } from "./commerceApi";

export function State({ request }) {
  if (request.error)
    return (
      <p role="alert" className={styles.error}>
        {request.error} <button onClick={request.reload}>Повторить</button>
      </p>
    );
  if (request.loading) return <p role="status">Загрузка…</p>;
  return null;
}

export function Shell({ title, description, children }) {
  return (
    <main className={styles.page}>
      <nav className={styles.nav} aria-label="Маркет и гарант">
        <NavLink to="/market" end>
          <FiShoppingBag /> Маркет
        </NavLink>
        <NavLink to="/market/sell">Продать</NavLink>
        <NavLink to="/market/orders">Мои покупки и продажи</NavLink>
        <NavLink to="/market/wallet">Баланс ₽</NavLink>
        <NavLink to="/guarantor">
          <FiShield /> Гарант
        </NavLink>
      </nav>
      <header className={styles.heading}>
        <h1>{title}</h1>
        <p>{description}</p>
      </header>
      {children}
    </main>
  );
}

export function LoginNotice() {
  return (
    <div className={styles.panel}>
      Для этой операции нужен аккаунт CryptoGoblin.{" "}
      <Link to="/login">
        Войти <FiArrowRight />
      </Link>
    </div>
  );
}

export function DealRows({ deals = [] }) {
  return (
    <div className={styles.rows}>
      {deals.map((d) => (
        <Link className={styles.row} key={d.id} to={`/commerce/deals/${d.id}`}>
          <div>
            <strong>{d.title}</strong>
            <small>
              {d.kind === "MARKET" ? "Маркет" : "Гарант"} · {date(d.created_at)}
            </small>
          </div>
          <div>
            <strong>{money(d.amount, d.currency)}</strong>
            <small>{labels[d.status]}</small>
          </div>
          <FiArrowRight />
        </Link>
      ))}
      {!deals.length && (
        <p className={styles.empty}>Здесь появятся ваши сделки.</p>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { TbPlus, TbRefresh } from "react-icons/tb";
import { enqueueSnackbar } from "notistack";
import api from "../../../api";
import { getApiErrorMessage } from "../../../utils/notifications";
import { formatDateTime, formatMoney, getPaymentMethodById, normalizePaymentMethods } from "../p2pUtils";
import { P2PMobileNav } from "../P2PMobileNav";
import styles from "./MyOffers.module.scss";

export const MyOffers = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [currentUser, setCurrentUser] = useState(null);

  const loadOrders = () => {
    setLoading(true);
    api.get("/order/my")
      .then((response) => {
        setOrders(Array.isArray(response.data) ? response.data : []);
      })
      .catch((error) => {
        enqueueSnackbar(getApiErrorMessage(error, "Ошибка загрузки объявлений"), {
          variant: "error",
          autoHideDuration: 4200,
        });
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      setCurrentUser(jwtDecode(token));
    }

    loadOrders();
  }, []);

  const myOrders = useMemo(() => {
    return orders
      .filter((order) => order.user?.id === currentUser?.userId)
      .filter((order) => filter === "all" || order.type === filter);
  }, [currentUser?.userId, filter, orders]);

  const buyCount = orders.filter(
    (order) => order.user?.id === currentUser?.userId && order.type === "BUY"
  ).length;

  const updateOrderStatus = (orderId, status) => {
    api
      .patch(`/order/${orderId}/status`, { status })
      .then(() => {
        enqueueSnackbar(
          status === "pending"
            ? "Объявление снова активно"
            : status === "paused"
              ? "Объявление поставлено на паузу"
              : "Объявление удалено из активных",
          { variant: "success" }
        );
        loadOrders();
      })
      .catch((error) => {
        enqueueSnackbar(getApiErrorMessage(error, "Не удалось изменить объявление"), {
          variant: "error",
        });
      });
  };
  const sellCount = orders.filter(
    (order) => order.user?.id === currentUser?.userId && order.type === "SELL"
  ).length;

  return (
    <main className={styles.offers}>
      <section className={styles.offers_header}>
        <div>
          <h1 className="h1 title">Мои объявления</h1>
          <p>Ваши активные P2P-объявления, цены, лимиты и быстрый переход к карточке ордера.</p>
        </div>
        <Link to="/p2p/create-order">
          <TbPlus />
          Создать
        </Link>
      </section>

      <section className={styles.offers_toolbar}>
        <div>
          {[
            ["all", "Все"],
            ["BUY", "Покупка"],
            ["SELL", "Продажа"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={filter === value ? styles.offers_filterActive : ""}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <button type="button" onClick={loadOrders}>
          <TbRefresh />
          Обновить
        </button>
      </section>

      <section className={styles.offers_stats}>
        <div>
          <span>Всего</span>
          <strong>{buyCount + sellCount}</strong>
        </div>
        <div>
          <span>Покупка</span>
          <strong>{buyCount}</strong>
        </div>
        <div>
          <span>Продажа</span>
          <strong>{sellCount}</strong>
        </div>
      </section>

      <section className={styles.offers_table}>
        <div className={styles.offers_tableHead}>
          <span>Тип</span>
          <span>Цена</span>
          <span>Количество</span>
          <span>Лимит</span>
          <span>Оплата</span>
          <span>Создан</span>
          <span></span>
        </div>

        {loading && (
          <div className={styles.offers_empty}>
            <p>Загружаем объявления...</p>
          </div>
        )}

        {!loading && myOrders.length === 0 && (
          <div className={styles.offers_empty}>
            <h2>Объявлений пока нет</h2>
            <p>Создайте первый P2P-ордер, чтобы он появился здесь.</p>
          </div>
        )}

        {!loading && myOrders.map((order) => (
          <div key={order.id} className={styles.offers_row}>
            {(() => {
              const availableAmount = Number(order.available_amount ?? order.amount);
              const minLimit = Number(order.min_limit || 0);
              const maxLimit = Number(order.max_limit || availableAmount * Number(order.price));
              const methods = normalizePaymentMethods(order.payment_methods).map(getPaymentMethodById);
              return (
                <>
            <span className={styles[`offers_side_${order.type === "SELL" ? "sell" : "buy"}`]}>
              {order.type === "SELL" ? "Продажа" : "Покупка"}
            </span>
            <strong>{formatMoney(order.price)}</strong>
            <span>{formatMoney(availableAmount, "USDT")}</span>
            <span>{formatMoney(minLimit)} - {formatMoney(maxLimit)}</span>
            <span className={styles.offers_methods}>
              {methods.slice(0, 3).map((method) => (
                <em key={method.id} style={{ "--method-tone": method.tone }}>
                  {method.shortName}
                </em>
              ))}
              {methods.length > 3 && <small>+{methods.length - 3}</small>}
            </span>
            <span>
              {formatDateTime(order.createdAt)}
              <small className={styles[`offers_status_${order.status}`]}>
                {order.status === "pending" ? "Активно" : order.status === "paused" ? "Пауза" : "Удалено"}
              </small>
            </span>
            <span className={styles.offers_actions}>
              <Link to={`/order/${order.id}`}>Открыть</Link>
              {order.status === "paused" ? (
                <button type="button" onClick={() => updateOrderStatus(order.id, "pending")}>Возобновить</button>
              ) : (
                <button type="button" onClick={() => updateOrderStatus(order.id, "paused")} disabled={order.status !== "pending"}>Пауза</button>
              )}
              <button type="button" onClick={() => updateOrderStatus(order.id, "cancelled")} disabled={order.status === "cancelled"}>Удалить</button>
            </span>
                </>
              );
            })()}
          </div>
        ))}
      </section>
      <P2PMobileNav />
    </main>
  );
};

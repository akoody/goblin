import React, { useEffect, useState } from "react";
import styles from "./Orders.module.scss";
import bg from "../../../assets/images/Group 756.png";
import { TbFilter, TbInbox, TbPlus, TbRefresh, TbShieldCheck } from "react-icons/tb";
import { FaUser } from "react-icons/fa";
import { enqueueSnackbar } from "notistack";
import { NumericFormat } from "react-number-format";
import { Link } from "react-router-dom";
import api from "../../../api";
import { getApiErrorMessage } from "../../../utils/notifications";
import { jwtDecode } from "jwt-decode";
import {
  formatDateTime,
  formatMoney,
  getMerchantStats,
  getPaymentMethodById,
  normalizePaymentMethods,
  orderSideConfig,
  p2pPaymentMethodGroups,
  p2pPaymentMethods,
} from "../p2pUtils";
import { P2PMobileNav } from "../P2PMobileNav";

export const Orders = () => {
  const [side, setSide] = useState("buy");
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [amountValue, setAmountValue] = useState("");
  const [priceValue, setPriceValue] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("all");
  const [currentUser, setCurrentUser] = useState(null);

  const loadOrders = () => {
    setLoading(true);
    api.get(localStorage.getItem("token") ? "/order" : "/order/catalog")
      .then((res) => {
        setData(Array.isArray(res.data) ? res.data : []);
      })
      .catch((err) => {
        enqueueSnackbar(getApiErrorMessage(err, "Ошибка загрузки ордеров"), {
          variant: "error",
          autoHideDuration: 4200,
        });
        if (err.response?.status === 401) {
          localStorage.removeItem("token");
          window.location.reload();
        }
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

  useEffect(() => {
    const currentSide = orderSideConfig[side];
    const minAmount = Number(amountValue);
    const maxPrice = Number(priceValue);

    let filteredData = data.filter((item) => item.type === currentSide.orderType && item.status === "pending");

    if (Number.isFinite(minAmount) && minAmount > 0) {
      filteredData = filteredData.filter((item) => Number(item.available_amount ?? item.amount) >= minAmount);
    }

    if (Number.isFinite(maxPrice) && maxPrice > 0) {
      filteredData = filteredData.filter((item) => Number(item.price) <= maxPrice);
    }

    if (paymentMethod !== "all") {
      filteredData = filteredData.filter((item) => normalizePaymentMethods(item.payment_methods).includes(paymentMethod));
    }

    filteredData = [...filteredData].sort((a, b) => {
      if (side === "buy") {
        return Number(a.price) - Number(b.price);
      }

      return Number(b.price) - Number(a.price);
    });

    setItems(filteredData);
  }, [side, data, amountValue, priceValue, paymentMethod]);

  const currentSide = orderSideConfig[side];
  const buyCount = data.filter((item) => item.type === "SELL").length;
  const sellCount = data.filter((item) => item.type === "BUY").length;

  return (
    <div className={styles.deals}>
      <img src={bg} className="background" alt="" />
      <section className={styles.deals_top}>
        <div>
          <h1 className="h1 title">P2P ордера</h1>
          <p>Выберите объявление, проверьте курс и откройте защищенную сделку с чатом.</p>
        </div>
        <Link to="/p2p/create-order">
          <TbPlus />
          Создать ордер
        </Link>
      </section>
      <section className={styles.deals_safety}>
        <TbShieldCheck />
        <p>Не переводите средства вне платформы и не отменяйте ордер после оплаты. История чата сохраняется для разбирательств.</p>
      </section>
      <div className={styles.deals_content}>
        <div className={styles.deals_content_main}>
          <div className={styles.deals_content_main_top}>
            <div className={styles.deals_content_main_top_right}>
              <button
                type="button"
                onClick={() => setSide("buy")}
                className={
                  side === "buy"
                    ? styles.deals_content_main_top_right_active
                    : ""
                }
              >
                Купить <span>{buyCount}</span>
              </button>
              <button
                type="button"
                onClick={() => setSide("sell")}
                className={
                  side === "sell"
                    ? styles.deals_content_main_top_right_active
                    : ""
                }
              >
                Продать <span>{sellCount}</span>
              </button>
            </div>
          </div>
          <div className={styles.deals_content_main_filter}>
            <div className={styles.deals_content_main_filter_right}>
              <NumericFormat
                value={amountValue}
                placeholder="Минимум USDT"
                thousandSeparator
                allowNegative={false}
                onValueChange={(values) => setAmountValue(values.value)}
              />
              <NumericFormat
                value={priceValue}
                placeholder="Максимальный курс RUB"
                thousandSeparator
                allowNegative={false}
                onValueChange={(values) => setPriceValue(values.value)}
              />
              <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
                <option value="all">Все способы оплаты</option>
                {p2pPaymentMethodGroups.map((group) => (
                  <optgroup key={group.id} label={group.name}>
                    {p2pPaymentMethods
                      .filter((method) => method.group === group.id)
                      .map((method) => (
                        <option key={method.id} value={method.id}>{method.name}</option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <button type="button" className="span" onClick={loadOrders}>
              <TbRefresh /> Обновить
            </button>
          </div>
          <div className={styles.deals_content_summary}>
            <span>
              <TbFilter />
              {currentSide.title}: {items.length} объявлений
            </span>
            <p>{side === "buy" ? "Сначала лучшие цены покупки" : "Сначала лучшие цены продажи"}</p>
          </div>
          <div className={styles.deals_content_main_body}>
            {loading ? (
              <div className={styles.deals_content_main_body_loading}>
                <p className="p">Загружаем объявления...</p>
              </div>
            ) : items.length > 0 ? (
              items.map((item) => {
                const isOwnOrder = Boolean(currentUser && item.user?.id === currentUser.userId);
                const stats = getMerchantStats(item.user?.id || item.id);
                const availableAmount = Number(item.available_amount ?? item.amount);
                const minLimit = Number(item.min_limit || 0);
                const maxLimit = Number(item.max_limit || availableAmount * Number(item.price));
                const methods = normalizePaymentMethods(item.payment_methods).map(getPaymentMethodById);
                const visibleMethods = methods.slice(0, 6);
                const hiddenMethodsCount = Math.max(methods.length - visibleMethods.length, 0);
                return (
                  <Link
                    to={`/order/${item.id}`}
                    key={item.id}
                    className={styles.deals_content_item}
                  >
                    <div className={styles.deals_content_item_top}>
                      <div className={styles.deals_content_item_top_left}>
                        <section>
                          <FaUser />
                        </section>
                        <div
                          className={styles.deals_content_item_top_left_user}
                        >
                          <p className="span">{item?.user?.username || "Пользователь"}</p>
                          <span>{isOwnOrder ? "Ваше объявление" : `${stats.orders} ордеров (${stats.completion}%)`}</span>
                        </div>
                      </div>
                      <button
                        className="p"
                        style={{
                          background:
                            side === "sell"
                              ? "var(--red-gradient)"
                              : "var(--green-gradient)",
                        }}
                      >
                        {isOwnOrder ? "Ваше" : currentSide.action}
                      </button>
                    </div>

                    <p className="p" style={{ fontWeight: "600" }}>
                      {formatMoney(item.price)}
                    </p>
                    <p>
                      Количество{" "}
                      <b style={{ fontWeight: 500 }}>{formatMoney(availableAmount, "USDT")}</b>
                    </p>
                    <p>
                      Лимит{" "}
                      <b style={{ fontWeight: 500 }}>
                        {formatMoney(minLimit)} - {formatMoney(maxLimit)}
                      </b>
                    </p>
                    <p>
                      Время{" "}
                      <b style={{ fontWeight: 500 }}>{stats.minutes} мин.</b>
                    </p>
                    <div className={styles.deals_content_methods}>
                      {visibleMethods
                        .map((method) => (
                          <span
                            key={method.id}
                            title={`${method.name}: ${method.description}`}
                            style={{ "--method-tone": method.tone }}
                          >
                            <b>{method.shortName}</b>
                          </span>
                        ))}
                      {hiddenMethodsCount > 0 && (
                        <span title={methods.slice(6).map((method) => method.name).join(", ")}>
                          +{hiddenMethodsCount}
                        </span>
                      )}
                    </div>
                    <p>
                      Обновлен{" "}
                      <b style={{ fontWeight: 500 }}>
                        {formatDateTime(item.createdAt)}
                      </b>
                    </p>
                  </Link>
                );
              })
            ) : (
              <div className={styles.deals_content_main_body_empty}>
                <TbInbox aria-hidden="true" />
                <strong>Подходящих ордеров нет</strong>
                <p>Измените фильтры или создайте объявление.</p>
              </div>
            )}
          </div>
        </div>
      </div>
      <P2PMobileNav />
    </div>
  );
};

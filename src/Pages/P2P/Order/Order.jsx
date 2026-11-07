import React, { useEffect, useState } from "react";
import styles from "./Order.module.scss";
import bg from "../../../assets/images/Group 756.png";
import { TbCopy } from "react-icons/tb";
import { FiChevronDown, FiShield, FiX } from "react-icons/fi";
import { NumericFormat } from "react-number-format";
import { enqueueSnackbar } from "notistack";
import { useNavigate, useParams } from "react-router-dom";
import api from "../../../api";
import { getApiErrorMessage } from "../../../utils/notifications";
import { jwtDecode } from "jwt-decode";
import {
  formatDateTime,
  formatMoney,
  getMerchantStats,
  getPaymentMethodById,
  normalizePaymentMethods,
  p2pPaymentMethods,
} from "../p2pUtils";
import { P2PMobileNav } from "../P2PMobileNav";

export const Order = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [mode, setMode] = useState("fiat");
  const [inputValue, setInputValue] = useState("");
  const [selectedPayment, setSelectedPayment] = useState(p2pPaymentMethods[0]);
  const [paymentsOpen, setPaymentsOpen] = useState(false);
  const [p2pFeePercent, setP2pFeePercent] = useState(5);
  const { id } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      setCurrentUser(jwtDecode(token));
    }

    setLoading(true);
    api.get(`/order/${id}`)
      .then((res) => setData(res.data))
      .catch((err) => {
        enqueueSnackbar(getApiErrorMessage(err, "Не удалось загрузить ордер."), {
          variant: "error",
        });
      })
      .finally(() => setLoading(false));
    api.get('/deal/fee-policy')
      .then(response => setP2pFeePercent(Number(response.data?.feePercent ?? 5)))
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    if (!data) {
      return;
    }

    const availablePayments = normalizePaymentMethods(data.payment_methods);
    setSelectedPayment(getPaymentMethodById(availablePayments[0]));
  }, [data]);

  const createDeal = () => {
    if (creating || data?.user?.id === currentUser?.userId) {
      return;
    }

    setCreating(true);
    api.post("/deal", {
      orderId: Number(id),
      cryptoAmount,
      fiatAmount,
      paymentMethod: selectedPayment.id,
    })
      .then((res) => {
        enqueueSnackbar("Сделка создана", { variant: "success" });
        navigate(`/deal/${res.data.id}`);
      })
      .catch((err) =>
        enqueueSnackbar(getApiErrorMessage(err, "Не удалось создать сделку."), {
          variant: "error",
        })
      )
      .finally(() => setCreating(false));
  };

  if (loading) {
    return <div className={styles.order_state}>Загружаем ордер...</div>;
  }

  if (!data) {
    return <div className={styles.order_state}>Ордер не найден</div>;
  }

  const isOwnOrder = data.user?.id === currentUser?.userId;
  const actionLabel = data.type === "SELL" ? "Купить USDT" : "Продать USDT";
  const directionLabel = data.type === "SELL" ? "Продавец продает" : "Покупатель покупает";
  const total = Number(data.amount) * Number(data.price);
  const price = Number(data.price);
  const availableAmount = Number(data.available_amount ?? data.amount);
  const maxFiat = Number(data.max_limit || total);
  const minFiat = Number(data.min_limit || 0);
  const orderPaymentIds = normalizePaymentMethods(data.payment_methods);
  const orderPayments = orderPaymentIds.map(getPaymentMethodById);
  const cryptoAmount = mode === "fiat" ? Number(inputValue || 0) / price : Number(inputValue || 0);
  const fiatAmount = mode === "fiat" ? Number(inputValue || 0) : Number(inputValue || 0) * price;
  const estimatedFee = Math.round(cryptoAmount * p2pFeePercent / 100 * 1_000_000) / 1_000_000;
  const estimatedBuyerNet = Math.max(cryptoAmount - estimatedFee, 0);
  const canCreateDeal =
    !isOwnOrder &&
    cryptoAmount > 0 &&
    cryptoAmount <= availableAmount &&
    fiatAmount >= minFiat &&
    fiatAmount <= maxFiat &&
    data.status === "pending";
  const stats = getMerchantStats(data.user?.id || data.id);

  return (
    <div className={styles.order}>
      <img src={bg} className="background" alt="" />
      <section className={styles.order_header}>
        <h1 className="h1 title">{data.type === "SELL" ? "Покупка USDT" : "Продажа USDT"}</h1>
        <p>
          Цена <strong>{formatMoney(data.price)}</strong> · защита сделки включена
        </p>
      </section>
      <div className={styles.order_alert}>
        <FiShield />
        <span>Ваша сделка защищена платформой. Общайтесь и подтверждайте оплату только внутри P2P.</span>
      </div>
      <section className={styles.order_tradeBox}>
        <div className={styles.order_modeTabs}>
          <button type="button" className={mode === "fiat" ? styles.order_modeActive : ""} onClick={() => setMode("fiat")}>
            За фиат
          </button>
          <button type="button" className={mode === "crypto" ? styles.order_modeActive : ""} onClick={() => setMode("crypto")}>
            За криптовалюту
          </button>
          <span>15 мин.</span>
        </div>
        <label className={styles.order_amountInput}>
          <NumericFormat
            value={inputValue}
            placeholder="0"
            thousandSeparator
            allowNegative={false}
            onValueChange={(values) => setInputValue(values.value)}
          />
          <div>
            <b>{mode === "fiat" ? "RUB" : "USDT"}</b>
            <button
              type="button"
              onClick={() => setInputValue(String(mode === "fiat" ? Math.min(maxFiat, availableAmount * price) : availableAmount))}
            >
              Макс.
            </button>
          </div>
        </label>
        <p className={styles.order_receive}>
          {mode === "fiat" ? "Я получу" : "К оплате"}:{" "}
          <strong>{mode === "fiat" ? formatMoney(cryptoAmount, "USDT") : formatMoney(fiatAmount)}</strong>
        </p>
        {p2pFeePercent > 0 && cryptoAmount > 0 && <p className={styles.order_receive}>
          Комиссия P2P {p2pFeePercent}%: {formatMoney(estimatedFee, "USDT")} · покупатель получит {formatMoney(estimatedBuyerNet, "USDT")} после удержания
        </p>}
        <p className={styles.order_receive}>
          Лимиты: <strong>{formatMoney(minFiat)} - {formatMoney(maxFiat)}</strong>
        </p>
      </section>
      <button type="button" className={styles.order_paymentSelect} onClick={() => setPaymentsOpen(true)}>
        <span style={{ "--method-tone": selectedPayment.tone }}>
          <b>{selectedPayment.shortName}</b>
          <div>
            {selectedPayment.name}
            <small>{selectedPayment.speed}</small>
          </div>
        </span>
        <FiChevronDown />
      </button>
      <div className={styles.order_content}>
        <div className={styles.order_content_main}>
          <div className={styles.order_content_top}>
            <p className="p">
              <span
                style={{ color: data.type === "BUY" ? "#BE1600" : "#567e5f" }}
              >
                {data.type === "BUY" ? "Покупка" : "Продажа"}
              </span>{" "}
              USDT
            </p>
            <strong>{directionLabel}</strong>
          </div>
          <div className={styles.order_merchant}>
            <div>
              <strong>{data.user?.username || data.user?.email || "Пользователь"}</strong>
              <span>{stats.orders} ордеров · {stats.completion}% выполнения · {stats.minutes} мин.</span>
            </div>
            <b>99%</b>
          </div>
          <div className={styles.order_content_item}>
            <section className={styles.order_content_item_section}>
              <span className="span">Автор объявления</span>
              <p className="p">{data.user?.username || data.user?.email || "Пользователь"}</p>
            </section>
            <section className={styles.order_content_item_section}>
              <span className="span">Количество</span>
              <p className="p" style={{ color: "#BE1600", fontWeight: "600" }}>
                {formatMoney(availableAmount, "USDT")}
              </p>
            </section>
            <section className={styles.order_content_item_section}>
              <span className="span">Цена</span>
              <p className="p">{formatMoney(data.price)}</p>
            </section>
            <section className={styles.order_content_item_section}>
              <span className="span">Лимит</span>
              <p className="p">{formatMoney(minFiat)} - {formatMoney(maxFiat)}</p>
            </section>
            <section className={styles.order_content_item_section}>
              <span className="span">Номер ордера</span>
              <p className="p">
                {id}
                <span>
                  <TbCopy
                    style={{ color: "#2A2E2B71", cursor: "pointer" }}
                    onClick={() => {
                      enqueueSnackbar("Скопировано", {
                        variant: "success",
                        autoHideDuration: 2000,
                      });
                      navigator.clipboard.writeText(id);
                    }}
                  />
                </span>
              </p>
            </section>
            <section className={styles.order_content_item_section}>
              <span className="span">Дата создания</span>
              <p className="p">{formatDateTime(data.createdAt)}</p>
            </section>
          </div>
        </div>
      </div>
      {isOwnOrder && (
        <div className={styles.order_notice}>
          Это ваше объявление. Открыть сделку по своему объявлению нельзя.
        </div>
      )}
      <button
        className="green-button"
        style={{
          width: "fit-content",
          padding: "7px 120px",
          fontWeight: "400",
          height: "auto",
          margin: "0 auto",
        }}
        onClick={createDeal}
        disabled={creating || !canCreateDeal}
      >
        {creating ? "Создаем..." : actionLabel}
      </button>
      {paymentsOpen && (
        <div className={styles.order_modalOverlay} onMouseDown={() => setPaymentsOpen(false)}>
          <section className={styles.order_paymentModal} onMouseDown={(event) => event.stopPropagation()}>
            <div>
              <h2>Выберите способ оплаты</h2>
              <button type="button" onClick={() => setPaymentsOpen(false)}><FiX /></button>
            </div>
            {orderPayments.map((method) => (
              <button
                key={method.id}
                type="button"
                className={selectedPayment.id === method.id ? styles.order_paymentActive : ""}
                onClick={() => {
                  setSelectedPayment(method);
                  setPaymentsOpen(false);
                }}
              >
                <span style={{ "--method-tone": method.tone }}>
                  <b>{method.shortName}</b>
                  <div>
                    <strong>{method.name}</strong>
                    <small>{method.description}</small>
                  </div>
                  <em>{method.speed}</em>
                </span>
              </button>
            ))}
          </section>
        </div>
      )}
      <P2PMobileNav />
    </div>
  );
};

import React, { useEffect, useState } from "react";
import styles from "./Deal.module.scss";
import bg from "../../../assets/images/Group 756.png";
import { TbCopy } from "react-icons/tb";
import { FiAlertTriangle, FiCheckCircle, FiX } from "react-icons/fi";
import { enqueueSnackbar } from "notistack";
import { useParams, useNavigate } from "react-router-dom";
import { Loader } from "../../../Components/Loader/Loader";
import api from "../../../api";
import Chat from "../../../Components/Chat/Chat";
import { jwtDecode } from "jwt-decode";
import { getApiErrorMessage } from "../../../utils/notifications";
import {
  formatDateTime,
  formatMoney,
  getDealStatusLabel,
  getPaymentMethodById,
  p2pCancelReasons,
} from "../p2pUtils";
import { P2PMobileNav } from "../P2PMobileNav";

export const Deal = () => {
  const [deal, setDeal] = useState(null);
  const [loading, setLoading] = useState(true);
  const { id } = useParams();
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [paymentChecks, setPaymentChecks] = useState({ paid: false, own: false });

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      setCurrentUser(jwtDecode(token));
    } else {
      navigate('/login');
    }

    api.get(`/deal/${id}`)
      .then((res) => {
        setDeal(res.data);
      })
      .catch((err) => {
        console.log(err);
        enqueueSnackbar(getApiErrorMessage(err, "Ошибка загрузки сделки"), {
          variant: "error",
          autoHideDuration: 4200,
        });
        if (err.response?.status === 401) {
          localStorage.removeItem("token");
          window.location.reload();
        }
      })
      .finally(() => setLoading(false));
  }, [id, navigate]);

  const handleUpdateStatus = (status) => {
    setLoading(true);
    api.patch(`/deal/${id}/status`, { status })
      .then((res) => {
        setDeal(res.data);
        enqueueSnackbar(`Статус сделки: ${getDealStatusLabel(status)}`, {
          variant: "success",
          autoHideDuration: 2000,
        });
      })
      .catch((err) => {
        console.log(err);
        enqueueSnackbar(getApiErrorMessage(err, "Ошибка обновления статуса"), {
          variant: "error",
          autoHideDuration: 4200,
        });
      })
      .finally(() => setLoading(false));
  };

  if (loading || !deal) {
    return <Loader />;
  }

  const isBuyer = currentUser?.userId === deal.buyer.id;
  const isSeller = currentUser?.userId === deal.seller.id;
  const isFinished = deal.status === "COMPLETED" || deal.status === "CANCELLED";
  const roleLabel = isBuyer ? "Вы покупатель" : isSeller ? "Вы продавец" : "Просмотр сделки";
  const cryptoAmount = Number(deal.crypto_amount || deal.order.amount);
  const dealPrice = Number(deal.price || deal.order.price);
  const total = Number(deal.fiat_amount || cryptoAmount * dealPrice);
  const selectedPayment = getPaymentMethodById(deal.payment_method);
  const canConfirmPayment = paymentChecks.paid && paymentChecks.own;
  const step = deal.status === "AWAITING_PAYMENT" ? 1 : deal.status === "PAYMENT_CONFIRMED" || deal.status === "DISPUTE" ? 2 : 3;

  return (
    <div className={styles.myOrders}>
      {loading && <Loader />}
      <img src={bg} className="background" alt="" />
      <section className={styles.myOrders_top}>
        <div>
          <h1 className="h1 title">
            {deal.status === "COMPLETED"
              ? "Сделка завершена"
              : deal.status === "CANCELLED"
              ? "Сделка отменена"
              : deal.status === "PAYMENT_CONFIRMED"
              ? "Платеж в обработке"
              : "Ожидание оплаты"}
          </h1>
          <p>{roleLabel}. Контроль оплаты, параметров ордера и переписки по сделке.</p>
        </div>
      </section>
      <section className={styles.myOrders_progress}>
        {[1, 2, 3].map((item) => (
          <span key={item} className={item <= step ? styles.myOrders_progressActive : ""}></span>
        ))}
      </section>
      {!isFinished && (
        <section className={styles.myOrders_warning}>
          <FiAlertTriangle />
          <p>Если к концу указанного времени не подтвердить действие, ордер может быть отменен. Не переводите средства вне платформы.</p>
        </section>
      )}
      <div className={styles.myOrders_content}>
        <div className={styles.myOrders_content_main}>
          <div className={styles.myOrders_content_item}>
            <div className={styles.myOrders_content_item_top}>
              <section>
                <p className="p">
                  <span style={{ color: isBuyer ? "#4e865a" : "#BE1600" }}>
                    {isBuyer ? 'BUY' : 'SELL'}
                  </span>{" "}
                  USDT
                </p>
                <span className="span">
                  {formatDateTime(deal.createdAt)}
                </span>
              </section>
              <div>
                <section className={styles.myOrders_content_item_top_section}>
                  <p className="span2">{getDealStatusLabel(deal.status)}</p>
                  {deal.status === 'AWAITING_PAYMENT' && isBuyer && (
                    <button onClick={() => setConfirmOpen(true)} className="green-button">
                      Платеж выполнен
                    </button>
                  )}
                  {deal.status === 'PAYMENT_CONFIRMED' && isSeller && (
                     <button onClick={() => handleUpdateStatus('COMPLETED')} className="green-button">
                       Подтвердить оплату
                     </button>
                  )}
                  {!isFinished && (
                    <button onClick={() => setCancelOpen(true)} className="red-button">
                      Отменить
                    </button>
                  )}
                  {!isFinished && deal.status !== "DISPUTE" && (
                    <button onClick={() => handleUpdateStatus("DISPUTE")} className="red-button">
                      Спор
                    </button>
                  )}
                </section>
              </div>
            </div>
            <section className={styles.myOrders_content_item_section}>
              <span className="span">Количество</span>
              <p className="p" style={{ fontWeight: "600" }}>
                {formatMoney(cryptoAmount, "USDT")}
              </p>
            </section>
            {Number(deal.p2p_fee_percent) > 0 && (
              <>
                <section className={styles.myOrders_content_item_section}>
                  <span className="span">Комиссия P2P ({deal.p2p_fee_percent}%)</span>
                  <p className="p">{formatMoney(deal.p2p_fee_amount, "USDT")}</p>
                </section>
                <section className={styles.myOrders_content_item_section}>
                  <span className="span">Покупатель получит после комиссии</span>
                  <p className="p" style={{ fontWeight: "600" }}>{formatMoney(deal.p2p_net_amount, "USDT")}</p>
                </section>
              </>
            )}
            <section className={styles.myOrders_content_item_section}>
              <span className="span">Цена</span>
              <p className="p">{formatMoney(dealPrice)}</p>
            </section>
            <section className={styles.myOrders_content_item_section}>
              <span className="span">Сумма к оплате</span>
              <p className="p">{formatMoney(total)}</p>
            </section>
            <section className={styles.myOrders_content_item_section}>
              <span className="span">Способ оплаты</span>
              <p className="p">
                <span style={{ color: selectedPayment.tone, fontWeight: 900 }}>
                  {selectedPayment.shortName}
                </span>
                {selectedPayment.name}
              </p>
            </section>
            <section className={styles.myOrders_content_item_section}>
              <span className="span">Покупатель</span>
              <p className="p">{deal.buyer?.username || deal.buyer?.email || `ID ${deal.buyer?.id}`}</p>
            </section>
            <section className={styles.myOrders_content_item_section}>
              <span className="span">Продавец</span>
              <p className="p">{deal.seller?.username || deal.seller?.email || `ID ${deal.seller?.id}`}</p>
            </section>
            <section className={styles.myOrders_content_item_section}>
              <span className="span">Номер ордера</span>
              <p className="p">
                {deal.order.id}
                <TbCopy
                  style={{ color: "#2A2E2B71", cursor: "pointer" }}
                  onClick={() => {
                    enqueueSnackbar("Скопировано", {
                      variant: "success",
                      autoHideDuration: 2000,
                    });
                    navigator.clipboard.writeText(deal.order.id);
                  }}
                />
              </p>
            </section>
            <div className={styles.myOrders_steps}>
              <h2>Инструкции</h2>
              <div>
                <b>1</b>
                <p>Переведите {formatMoney(total)} через {selectedPayment.name}. Реквизиты уточняйте только в чате сделки.</p>
              </div>
              <div>
                <b>2</b>
                <p>После оплаты нажмите кнопку подтверждения. Продавец выпустит криптовалюту после проверки поступления.</p>
              </div>
              <div>
                <b>3</b>
                <p>Если возникла проблема, не отменяйте оплаченный ордер. Напишите продавцу или поддержке.</p>
              </div>
            </div>
          </div>
          {currentUser && <Chat dealId={id} currentUser={currentUser} />}
        </div>
      </div>
      {confirmOpen && (
        <div className={styles.myOrders_modalOverlay}>
          <section className={styles.myOrders_modal}>
            <div className={styles.myOrders_modalTop}>
              <h2>Подтверждение платежа</h2>
              <button type="button" onClick={() => setConfirmOpen(false)}><FiX /></button>
            </div>
            <div className={styles.myOrders_confirmAlert}>
              <FiAlertTriangle />
              Не нажимайте подтверждение, пока фактически не отправили деньги.
            </div>
            <div className={styles.myOrders_requisites}>
              <strong>{selectedPayment.name}</strong>
              <p><span>Сумма</span><b>{formatMoney(total)}</b></p>
              <p><span>Получатель</span><b>Уточните в чате сделки</b></p>
            </div>
            <label className={styles.myOrders_check}>
              <input
                type="checkbox"
                checked={paymentChecks.paid}
                onChange={(event) => setPaymentChecks((value) => ({ ...value, paid: event.target.checked }))}
              />
              Я совершил платеж по указанным реквизитам.
            </label>
            <label className={styles.myOrders_check}>
              <input
                type="checkbox"
                checked={paymentChecks.own}
                onChange={(event) => setPaymentChecks((value) => ({ ...value, own: event.target.checked }))}
              />
              Я оплатил со счета, оформленного на мое имя.
            </label>
            <button
              type="button"
              className="green-button"
              disabled={!canConfirmPayment}
              onClick={() => {
                setConfirmOpen(false);
                handleUpdateStatus("PAYMENT_CONFIRMED");
              }}
            >
              Подтвердить
            </button>
          </section>
        </div>
      )}
      {cancelOpen && (
        <div className={styles.myOrders_modalOverlay}>
          <section className={styles.myOrders_modal}>
            <div className={styles.myOrders_modalTop}>
              <h2>Отменить ордер</h2>
              <button type="button" onClick={() => setCancelOpen(false)}><FiX /></button>
            </div>
            <div className={styles.myOrders_cancelNotice}>
              <FiAlertTriangle />
              Причину отмены можно выбрать только один раз. Не отменяйте ордер после оплаты.
            </div>
            <div className={styles.myOrders_reasons}>
              {p2pCancelReasons.map((reason) => (
                <label key={reason}>
                  <input
                    type="radio"
                    name="cancelReason"
                    checked={cancelReason === reason}
                    onChange={() => setCancelReason(reason)}
                  />
                  {reason}
                </label>
              ))}
            </div>
            <button
              type="button"
              className="red-button"
              disabled={!cancelReason}
              onClick={() => {
                setCancelOpen(false);
                api.patch(`/deal/${id}/status`, { status: "CANCELLED", cancelReason })
                  .then((res) => {
                    setDeal(res.data);
                    enqueueSnackbar("Сделка отменена", { variant: "success", autoHideDuration: 2000 });
                  })
                  .catch((err) => {
                    enqueueSnackbar(getApiErrorMessage(err, "Ошибка отмены сделки"), {
                      variant: "error",
                      autoHideDuration: 4200,
                    });
                  });
              }}
            >
              Подтвердить отмену
            </button>
          </section>
        </div>
      )}
      {deal.status === "COMPLETED" && (
        <div className={styles.myOrders_doneToast}>
          <FiCheckCircle />
          Сделка успешно завершена
        </div>
      )}
      <P2PMobileNav />
    </div>
  );
};

import React, { useMemo, useState, useEffect } from "react";
import styles from "./CreateOrder.module.scss";
import bg from "../../../assets/images/Group 756.png";
import { NumericFormat } from "react-number-format";
import { enqueueSnackbar } from "notistack";
import { Loader } from "../../../Components/Loader/Loader";
import api from "../../../api";
import { useNavigate } from "react-router-dom";
import { getApiErrorMessage } from "../../../utils/notifications";
import { FiChevronDown, FiSearch, FiX } from "react-icons/fi";
import {
  formatMoney,
  p2pPaymentMethodGroups,
} from "../p2pUtils";
import { P2PMobileNav } from "../P2PMobileNav";

export const CreateOrder = () => {
  const [type, setType] = useState("BUY");
  const [amount, setAmount] = useState("");
  const [price, setPrice] = useState("");
  const [minLimit, setMinLimit] = useState("");
  const [maxLimit, setMaxLimit] = useState("");
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [paymentSearch, setPaymentSearch] = useState("");
  const [paymentsOpen, setPaymentsOpen] = useState(false);
  const [paymentDefinitions, setPaymentDefinitions] = useState(null);
  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState({ usdtBalance: 0, trxBalance: 0 });
  const navigate = useNavigate();
  const availablePaymentMethods = Array.isArray(paymentDefinitions) ? paymentDefinitions : [];
  const availablePaymentGroups = useMemo(() => {
    const usedGroups = new Set(availablePaymentMethods.map((method) => method.group));
    const knownGroups = p2pPaymentMethodGroups.filter((group) => usedGroups.has(group.id));
    const customGroups = [...usedGroups]
      .filter((groupId) => !p2pPaymentMethodGroups.some((group) => group.id === groupId))
      .map((groupId) => ({ id: groupId, name: groupId === "other" ? "Другое" : groupId }));

    return [...knownGroups, ...customGroups];
  }, [availablePaymentMethods]);
  const orderAmount = Number(amount || 0);
  const orderPrice = Number(price || 0);
  const total = orderAmount * orderPrice;
  const normalizedMinLimit = Number(minLimit || 0);
  const normalizedMaxLimit = Number(maxLimit || total);
  const canSubmit =
    orderAmount > 0 &&
    orderPrice > 0 &&
    normalizedMaxLimit > 0 &&
    normalizedMinLimit <= normalizedMaxLimit &&
    normalizedMaxLimit <= total &&
    paymentMethods.length > 0 &&
    !loading;
  const paymentQuery = paymentSearch.trim().toLowerCase();
  const makerSideLabel = type === "BUY" ? "Покупка USDT" : "Продажа USDT";
  const counterpartyTabLabel = type === "BUY" ? "Продать" : "Купить";
  const selectedPaymentObjects = paymentMethods
    .map((methodId) => availablePaymentMethods.find((method) => method.id === methodId || method.code === methodId))
    .filter(Boolean);

  const togglePaymentMethod = (methodId, checked) => {
    setPaymentMethods((current) => {
      if (checked) {
        return current.includes(methodId) ? current : [...current, methodId];
      }

      return current.filter((item) => item !== methodId);
    });
  };

  // Load user balance
  useEffect(() => {
    api.get("/api/transactions/balance")
      .then((res) => setBalance(res.data))
      .catch((err) => console.log(err));
  }, []);

  useEffect(() => {
    api
      .get("/payment-methods/definitions")
      .then((response) => {
        const definitions = Array.isArray(response.data) ? response.data : [];
        setPaymentDefinitions(definitions);
        setPaymentMethods((current) => {
          const availableIds = new Set(definitions.map((method) => method.id || method.code));
          const validSelections = current.filter((method) => availableIds.has(method));
          return validSelections.length > 0
            ? validSelections
            : definitions.slice(0, 3).map((method) => method.id || method.code);
        });
      })
      .catch(() => {
        setPaymentDefinitions([]);
        enqueueSnackbar("Не удалось загрузить доступные способы оплаты", { variant: "error" });
      });
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!canSubmit) {
      enqueueSnackbar("Проверьте сумму, цену, лимиты и способы оплаты", {
        variant: "error",
        autoHideDuration: 3000,
      });
      return;
    }

    setLoading(true);

    // Check balance for SELL orders
    if (type === 'SELL' && balance.usdtBalance < orderAmount) {
      enqueueSnackbar(`Недостаточно USDT на балансе. Требуется: ${orderAmount}, Доступно: ${balance.usdtBalance}`, {
        variant: "error",
        autoHideDuration: 3000,
      });
      setLoading(false);
      return;
    }

    const orderData = {
      type,
      amount: orderAmount,
      price: orderPrice,
      minLimit: normalizedMinLimit > 0 ? normalizedMinLimit : Math.min(total, orderPrice),
      maxLimit: normalizedMaxLimit,
      paymentMethods,
    };

    api.post("/order", orderData)
      .then((res) => {
        enqueueSnackbar("Ордер успешно создан", {
          variant: "success",
          autoHideDuration: 2000,
        });
        navigate("/p2p/my-offers");
      })
      .catch((err) => {
        console.log(err);
        enqueueSnackbar(getApiErrorMessage(err, "Ошибка создания ордера"), {
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

  return (
    <div className={styles.createOrder}>
      {loading && <Loader />}
      <img src={bg} className="background" alt="" />
      <section className={styles.createOrder_header}>
        <h1 className="h1 title">Создание ордера</h1>
        <p>Настройте сторону сделки, сумму и цену. Форма адаптирована под быстрый ввод на десктопе и телефоне.</p>
      </section>
      <div className={styles.createOrder_top}>
        <button
          type="button"
          onClick={() => setType("BUY")}
          className={type === "BUY" ? styles.createOrder_top_active : ""}
        >
          Хочу купить
        </button>
        <button
          type="button"
          onClick={() => setType("SELL")}
          className={type === "SELL" ? styles.createOrder_top_active : ""}
        >
          Хочу продать
        </button>
      </div>
      <section className={styles.createOrder_sideHint}>
        <strong>{makerSideLabel}</strong>
        <span>
          Это ваше объявление. В общем стакане оно будет доступно другим пользователям во вкладке
          {" "}<b>{counterpartyTabLabel}</b>, потому что там показывается действие второй стороны сделки.
        </span>
      </section>

      <form className={styles.createOrder_body} onSubmit={handleSubmit}>
        <div className={styles.createOrder_left}>
          <label>
            <p className="p">Криптовалюта</p>
            <select className={styles.createOrder_select} name="crypto" id="">
              <option value="usdt">USDT</option>
            </select>
          </label>
          {type === 'SELL' && (
            <div className={styles.createOrder_balance}>
              <p>
                Доступно: <strong>{balance.usdtBalance} USDT</strong>
              </p>
            </div>
          )}
          <label>
            <p className="p">Сумма</p>
            <NumericFormat
              className="span"
              value={amount}
              onValueChange={(values) => setAmount(values.value)}
              suffix=" USDT"
              thousandSeparator={true}
              fixedDecimalScale={true}
              allowNegative={false}
              allowLeadingZeros={false}
            />
          </label>
        </div>
        <div className={styles.createOrder_left}>
          <label>
            <p className="p">Фиат</p>
            <select
              className={styles.createOrder_select}
              name="currency"
              id=""
            >
              <option value="usdt">RUB</option>
            </select>
          </label>
          <label>
            <p className="p">Торговая цена</p>
            <NumericFormat
              className="span"
              value={price}
              onValueChange={(values) => setPrice(values.value)}
              suffix=" RUB"
              thousandSeparator={true}
              fixedDecimalScale={true}
              allowNegative={false}
              allowLeadingZeros={false}
            />
          </label>
          <div className={styles.createOrder_total}>
            <span>Итого по объявлению</span>
            <strong>{formatMoney(total)}</strong>
          </div>
          <label>
            <p className="p">Минимальный лимит</p>
            <NumericFormat
              className="span"
              value={minLimit}
              onValueChange={(values) => setMinLimit(values.value)}
              suffix=" RUB"
              thousandSeparator={true}
              fixedDecimalScale={true}
              allowNegative={false}
              allowLeadingZeros={false}
            />
          </label>
          <label>
            <p className="p">Максимальный лимит</p>
            <NumericFormat
              className="span"
              value={maxLimit}
              placeholder={total ? String(total) : "0"}
              onValueChange={(values) => setMaxLimit(values.value)}
              suffix=" RUB"
              thousandSeparator={true}
              fixedDecimalScale={true}
              allowNegative={false}
              allowLeadingZeros={false}
            />
          </label>
          <div className={styles.createOrder_methods}>
            <div className={styles.createOrder_methodsTop}>
              <p className="p">Способы оплаты</p>
              <span>{paymentMethods.length} выбрано</span>
            </div>
            <button
              type="button"
              className={`${styles.createOrder_methodsTrigger} ${paymentsOpen ? styles.createOrder_methodsTriggerOpen : ""}`}
              onClick={() => setPaymentsOpen((current) => !current)}
            >
              <div className={styles.createOrder_selectedPreview}>
                {selectedPaymentObjects.length > 0 ? (
                  selectedPaymentObjects.slice(0, 5).map((method) => (
                    <span key={method.id} style={{ "--method-tone": method.tone }}>
                      {method.shortName}
                      <FiX
                        onClick={(event) => {
                          event.stopPropagation();
                          togglePaymentMethod(method.id, false);
                        }}
                      />
                    </span>
                  ))
                ) : (
                  <em>Выберите способы, которые принимает объявление</em>
                )}
                {selectedPaymentObjects.length > 5 && <b>+{selectedPaymentObjects.length - 5}</b>}
              </div>
              <FiChevronDown />
            </button>
            {paymentsOpen && (
              <div className={styles.createOrder_methodsDropdown}>
                <label className={styles.createOrder_methodsSearch}>
                  <FiSearch />
                  <input
                    type="text"
                    value={paymentSearch}
                    placeholder="Найти банк, кошелек или перевод"
                    onChange={(event) => setPaymentSearch(event.target.value)}
                  />
                </label>
                <div className={styles.createOrder_methodsQuick}>
                  <button type="button" onClick={() => setPaymentMethods(["sbp", "card", "tbank", "sber"])}>
                    Популярные
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setPaymentMethods(
                        availablePaymentMethods
                          .filter((method) => method.group === "banks")
                          .map((method) => method.id || method.code)
                      )
                    }
                  >
                    Все банки
                  </button>
                  <button type="button" onClick={() => setPaymentMethods([])}>
                    Очистить
                  </button>
                </div>
                <div className={styles.createOrder_methodsList}>
                  {availablePaymentGroups.map((group) => {
                    const methods = availablePaymentMethods.filter((method) => method.group === group.id).filter((method) => {
                      if (!paymentQuery) {
                        return true;
                      }

                      return [method.name, method.shortName, method.description]
                        .join(" ")
                        .toLowerCase()
                        .includes(paymentQuery);
                    });

                    if (methods.length === 0) {
                      return null;
                    }

                    return (
                      <section key={group.id} className={styles.createOrder_methodsGroup}>
                        <h3>{group.name}</h3>
                        <div>
                          {methods.map((method) => {
                            const methodId = method.id || method.code;
                            const selected = paymentMethods.includes(methodId);

                            return (
                              <label
                                key={methodId}
                                className={selected ? styles.createOrder_methodActive : ""}
                                style={{ "--method-tone": method.tone }}
                              >
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  onChange={(event) => togglePaymentMethod(methodId, event.target.checked)}
                                />
                                <span>{method.shortName}</span>
                                <div>
                                  <strong>{method.name}</strong>
                                  <small>{method.description}</small>
                                </div>
                                <em>{method.speed}</em>
                              </label>
                            );
                          })}
                        </div>
                      </section>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <label>
            <p className="p">&nbsp;</p>
            <button
              type="submit"
              className="green-button"
              style={{ height: "45px", boxShadow: "none" }}
              disabled={!canSubmit}
            >
              {loading ? "Создаем..." : "Создать ордер"}
            </button>
          </label>
        </div>
      </form>
      <P2PMobileNav />
    </div>
  );
};

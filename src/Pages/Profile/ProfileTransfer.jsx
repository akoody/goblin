// Перевод средств другому пользователю.
import React from "react";
import styles from "./Profile.module.scss";
import { BiChevronDown } from "react-icons/bi";
import { Input } from "../../Components/Input/Input";
import { NumericFormat } from "react-number-format";
import api from "../../api";
import { enqueueSnackbar } from "notistack";
import { walletPrecision } from "./profileWallets";

export const ProfileTransaction = () => {
  const [transactionType, setTransactionType] = React.useState(0);
  const [address, setAddress] = React.useState("");
  const [amount, setAmount] = React.useState(0);
  const [currency, setCurrency] = React.useState("USDT");
  const [isOpen, setIsOpen] = React.useState(false);
  const [currencyColor, setCurrencyColor] = React.useState("#28633b");
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [code, setCode] = React.useState("");
  const [isCodeSent, setIsCodeSent] = React.useState(false);
  const submissionInFlight = React.useRef(false);
  const idempotencyRequest = React.useRef(null);

  const handleInnerSubmit = (e) => {
    e.preventDefault();
    setIsModalOpen(1);
  };

  const CurrencySelector = () => (
    <div className={styles.profile_transaction_currency}>
      <div className={styles.profile_transaction_select}>
        <div
          onClick={() => setIsOpen(!isOpen)}
          className={styles.profile_transaction_select_value}
        >
          <p style={{ color: currencyColor }}> {currency}</p>
          <BiChevronDown />
        </div>

        {isOpen && (
          <div className={styles.profile_transaction_select_list}>
            <div
              className={styles.profile_transaction_select_item}
              onClick={() => {
                setCurrency("USDT");
                setIsOpen(false);
                setCurrencyColor("#28633b");
              }}
            >
              USDT
            </div>
            <div
              className={styles.profile_transaction_select_item}
              onClick={() => {
                setCurrency("TRX");
                setIsOpen(false);
                setCurrencyColor("#916e10");
              }}
            >
              TRX
            </div>
            <div
              className={styles.profile_transaction_select_item}
              onClick={() => {
                setCurrency("BTC");
                setIsOpen(false);
                setCurrencyColor("#a95a0b");
              }}
            >
              BTC
            </div>
            <div
              className={styles.profile_transaction_select_item}
              onClick={() => {
                setCurrency("ETH");
                setIsOpen(false);
                setCurrencyColor("#515d72");
              }}
            >
              ETH
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const handleTranslate = () => {
    if (submissionInFlight.current) return;
    if (address == "" || amount == "" || currency == "" || isCodeSent == true) {
      enqueueSnackbar("Заполните получателя, валюту и сумму", { variant: "error" });
      return;
    }

    submissionInFlight.current = true;
    setIsCodeSent(true);

    const requestData = transactionType == 0
      ? { email: address, amount, currency }
      : { address, amount, currency };
    const fingerprint = JSON.stringify({ transactionType, ...requestData });
    if (idempotencyRequest.current?.fingerprint !== fingerprint) {
      idempotencyRequest.current = {
        fingerprint,
        key: window.crypto.randomUUID(),
      };
    }

    const internalConfig = {
      method: "POST",
      url: `/api/transactions/send`,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },

      data: requestData,
    };

    const externalConfig = {
      method: "POST",
      url: `/api/transactions/send`,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },

      data: requestData,
    };

    api
      .post(
        transactionType == 0 ? internalConfig.url : externalConfig.url,
        requestData,
        { headers: { "Idempotency-Key": idempotencyRequest.current.key } }
      )
      .then((response) => {
        console.log(response.data);
        idempotencyRequest.current = null;
        setIsModalOpen(3);
      })
      .catch((err) => {
        enqueueSnackbar(err.response?.data?.message || "Не удалось выполнить перевод", {
          variant: "error",
        });
      })
      .finally(() => {
        setCode("");
        setIsCodeSent(false);
        submissionInFlight.current = false;
      });
  };

  return (
    <div className={styles.profile_transaction}>
      <div className={styles.profile_transaction_top}>
        <button
          type="button"
          className={
            transactionType == 0
              ? styles.profile_transaction_top_item_active
              : ""
          }
          onClick={() => setTransactionType(0)}
        >
          Внутренний перевод
        </button>
        <button
          type="button"
          className={
            transactionType == 1
              ? styles.profile_transaction_top_item_active
              : ""
          }
          onClick={() => setTransactionType(1)}
        >
          Внешний перевод
        </button>
      </div>
      {transactionType == 0 ? (
        <>
          <h1 className={styles.profile_transaction_title}>
            Введите адрес для перевода внутри биржи
          </h1>
          <form
            className={styles.profile_transaction_form}
            onSubmit={(e) => handleInnerSubmit(e)}
          >
            <div className={styles.profile_transaction_adress_input}>
              <input
                type="text"
                name="email"
                placeholder="Почта  "
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                required
              />
            </div>
            <h1>Выберите крипто</h1>
            <CurrencySelector />
            <h1>Напишите количество</h1>
            <div
              style={{ flex: 1 }}
              className={styles.profile_transaction_amount_input}
            >
              <NumericFormat
                required
                thousandSeparator=" "
                decimalScale={walletPrecision[currency]}
                fixedDecimalScale={false}
                allowNegative={false}
                decimalSeparator=","
                value={amount}
                onValueChange={(values) => {
                  const { formattedValue, value } = values;
                  setAmount(value);
                }}
                placeholder="Количество"
                className={styles.profile_transaction_amount_input}
              />
              <p style={{ color: currencyColor }}>{currency}</p>
            </div>

            <div className={styles.profile_transaction_amount}>
              {amount}
              <p style={{ color: currencyColor }}>{currency}</p>
            </div>
            <button
              type="submit"
              className={`red-button ${styles.profile_transaction_sendButton}`}
            >
              Отправить
            </button>
          </form>
        </>
      ) : (
        <>
          <h1 className={styles.profile_transaction_title}>
            Введите адрес внешнего кошелька
          </h1>
          <form
            className={styles.profile_transaction_form}
            onSubmit={(e) => handleInnerSubmit(e)}
          >
            <div className={styles.profile_transaction_adress_input}>
              <input
                type="text"
                name="email"
                placeholder="Адрес кошелька"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                required
              />
            </div>
            <h1>Выберите крипто</h1>
            <CurrencySelector />
            <h1>Напишите количество</h1>
            <div
              style={{ flex: 1 }}
              className={styles.profile_transaction_amount_input}
            >
              <NumericFormat
                required
                thousandSeparator=" "
                decimalScale={walletPrecision[currency]}
                fixedDecimalScale={false}
                allowNegative={false}
                decimalSeparator=","
                value={amount}
                onValueChange={(values) => {
                  const { formattedValue, value } = values;
                  setAmount(value);
                }}
                placeholder="Количество"
                className={styles.profile_transaction_amount_input}
              />
              <p style={{ color: currencyColor }}>{currency}</p>
            </div>

            <div className={styles.profile_transaction_amount}>
              {amount}
              <p style={{ color: currencyColor }}>{currency}</p>
            </div>
            <button
              type="submit"
              className={`red-button ${styles.profile_transaction_sendButton}`}
            >
              Отправить
            </button>
          </form>
        </>
      )}

      {isModalOpen == 1 && (
        <div className={styles.modal}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setIsModalOpen(2);
            }}
            className={styles.modal_content}
          >
            <h1>Введите код</h1>
            <p>
              Введите код, отправленный вам на почту для подтверждения перевода
              в <br />
              <b> {amount}</b>{" "}
              <b style={{ color: currencyColor }}>{currency}</b>
            </p>
            <Input
              type="text"
              placeholder={<p>Код с почты</p>}
              value={code}
              onChange={(value) => setCode(value)}
            />
            <button type="submit" className="green-button">
              Перевести
            </button>
            <button
              type="button"
              className="red-button"
              onClick={() => {
                setIsModalOpen(false);
                setCode("");
              }}
            >
              Отмена
            </button>
          </form>
        </div>
      )}

      {isModalOpen == 2 && (
        <div className={styles.modal}>
          <div className={styles.modal_content}>
            <h1>Подтвердите действие</h1>
            <p>
              Вы уверенны что хотите перевести ваши средста на другой кошелек?
            </p>
            <Input value={address} readonly={true} />
            <p className={styles.modal_amount}>
              <b>{amount}</b>
              <b style={{ color: currencyColor }}>{currency}</b>
            </p>
            <button
              onClick={() => handleTranslate()}
              className="green-button"
              style={{ marginTop: "20px" }}
            >
              Подтверждаю
            </button>
            <button
              onClick={() => {
                setIsModalOpen(false);
                setCode("");
              }}
              className="red-button"
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {isModalOpen == 3 && (
        <div className={styles.modal}>
          <div className={styles.modal_content}>
            <h1 style={{ color: "#86C239" }}>Успешно!</h1>
            <p>Перевод успешно выполнен</p>
            <p>
              Сумма перевода
              <b> {amount}</b>{" "}
              <b style={{ color: currencyColor }}>{currency}</b>
            </p>
            <p>На аккаунт:</p>
            <Input value={address} readonly={true} />
            <button
              className="link"
              onClick={() => {
                setIsModalOpen(false);
                setCode("");
              }}
            >
              Закрыть
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// Способы оплаты пользователя для P2P.
import React, { useEffect, useState } from "react";
import styles from "./Profile.module.scss";
import { BiWallet } from "react-icons/bi";
import { FaUser } from "react-icons/fa";
import SberLogo from "./assets/Sber_logo.svg";
import TinkoffLogo from "./assets/Tinkoff_logo.svg";
import Cashlogo from "./assets/Cash.svg";
import CardLogo from "./assets/Credit_card.svg";
import { Input } from "../../Components/Input/Input";
import api from "../../api";
import { LuTrash2 } from "react-icons/lu";
import { TbEdit } from "react-icons/tb";
import { enqueueSnackbar } from "notistack";
import { formatAssetAmount } from "../../utils/wallets";
import { walletPrecision } from "./profileWallets";

export const PaymentMethods = () => {
  const [openedModal, setOpenedModal] = React.useState(null);
  const [me, setMe] = React.useState(null);
  const [methods, setMethods] = useState([]);
  const [definitions, setDefinitions] = useState([]);

  const refresh = () => {
    api
      .get(`/payment-methods`)
      .then((response) => {
        setMethods(response.data);
      })
      .catch((err) => {
        console.log(err);
      });

    api
      .get(`/payment-methods/definitions`)
      .then((response) => setDefinitions(Array.isArray(response.data) ? response.data : []))
      .catch((err) => console.log(err));

    api
      .get(`/api/auth/me`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      })
      .then((response) => {
        setMe(response.data);
      })
      .catch((err) => {
        if (err.response?.status == 401) {
          localStorage.removeItem("token");
          window.location.reload();
        }
      });
  };

  useEffect(() => {
    refresh();
  }, []);

  const paymentMethods = definitions.length > 0 ? definitions : [
    {
      name: "Тинькофф",
      shortName: "Т-Банк",
      type: "card",
      code: "card",
      brand: "Tinkoff",
      fields: [
        { key: "fullName", label: "Фамилия Имя", required: true },
        { key: "accountNumber", label: "Номер счета", required: true },
        { key: "comment", label: "Комментарий", required: false },
      ],
      logo: <img src={TinkoffLogo} alt="Tinkoff Logo" />,
    },
    {
      name: "Сбербанк",
      shortName: "Сбер",
      brand: "SberBank",
      type: "card",
      code: "sber",
      fields: [
        { key: "fullName", label: "Фамилия Имя", required: true },
        { key: "accountNumber", label: "Номер счета", required: true },
        { key: "comment", label: "Комментарий", required: false },
      ],
      logo: <img src={SberLogo} alt="Sberbank Logo" />,
    },
    {
      name: "Онлайн перевод",
      type: "online",
      logo: <img src={CardLogo} alt="Card Logo" />,
    },
    {
      name: "Наличные",
      type: "cash",
      logo: <img src={Cashlogo} alt="Cash Logo" />,
    },
  ];

  const getDefinition = (type) =>
    paymentMethods.find((method) => (method.code || method.id || method.type) === type || method.type === type);

  const getMethodSummary = (method) => {
    const details = method?.details || {};
    return details.accountNumber || details.cardNumber || details.phone || details.wallet || details.comment || "-";
  };

  const getWallets = () => {
    const wallets = Array.isArray(me?.wallets) ? me.wallets : [];
    return ["BTC", "ETH", "USDT", "TRX"].map((currency) => {
      const wallet = wallets.find((item) => String(item.currency).toUpperCase() === currency);
      return wallet || { currency, address: "Адрес пока не создан", balance: 0 };
    });
  };

  const handleSubmit = () => {
    if (!openedModal.type) return;

    const data = openedModal;
    const definition = getDefinition(openedModal.type);

    for (const field of definition?.fields || []) {
      const value = String(data.details?.[field.key] || "").trim();

      if (field.required !== false && !value) {
        enqueueSnackbar(`Заполните поле: ${field.label}`, { variant: "error" });
        return;
      }

      if (field.minLength && value.length < Number(field.minLength)) {
        enqueueSnackbar(`${field.label}: минимум ${field.minLength} символов`, { variant: "error" });
        return;
      }

      if (field.maxLength && value.length > Number(field.maxLength)) {
        enqueueSnackbar(`${field.label}: максимум ${field.maxLength} символов`, { variant: "error" });
        return;
      }

      if (field.pattern && value) {
        try {
          if (!new RegExp(field.pattern).test(value)) {
            enqueueSnackbar(`${field.label}: неверный формат`, { variant: "error" });
            return;
          }
        } catch {
          enqueueSnackbar(`${field.label}: ошибка правила проверки`, { variant: "error" });
          return;
        }
      }
    }

    if (data.editing) {
      const { editing, ...rest } = data;
      api
        .patch("/payment-methods/" + data.id, rest)
        .then(() => {
          enqueueSnackbar("Способ оплаты обновлен", { variant: "success" });
          refresh();
        })
        .catch((err) => enqueueSnackbar(err.response?.data?.message || "Не удалось обновить способ оплаты", { variant: "error" }));
    } else
      api
        .post("/payment-methods", data)
        .then(() => {
          enqueueSnackbar("Способ оплаты добавлен", { variant: "success" });
          refresh();
        })
        .catch((err) => enqueueSnackbar(err.response?.data?.message || "Не удалось добавить способ оплаты", { variant: "error" }));

    setOpenedModal(null);
  };

  const handleDelete = (id) => {
    const confirm = window.confirm(
      "Вы уверены, что хотите удалить метод оплаты?"
    );
    if (!confirm) return;

    api
      .delete("/payment-methods/" + id)
      .then(() => {
        enqueueSnackbar("Способ оплаты удален", { variant: "success" });
        refresh();
      })
      .catch((err) => enqueueSnackbar(err.response?.data?.message || "Не удалось удалить способ оплаты", { variant: "error" }));
  };

  return (
    <div className={styles.profile_payments}>
      <h2>Способы оплаты</h2>
      <div className={styles.profile_payments_list}>
        {methods.map((method, index) => (
          <div key={index} className={styles.profile_payments_item}>
            <div className={styles.profile_payments_item_logo}>
              {getDefinition(method.type)?.shortName || getDefinition(method.type)?.name || method.type}
            </div>
            <div className={styles.profile_payments_item_info}>
              <p>{getMethodSummary(method)}</p>
              <p>{method?.label}</p>
            </div>
            <div className={styles.profile_payments_item_action}>
              <button
                className="link"
                onClick={() => setOpenedModal({ ...method, editing: true })}
              >
                <TbEdit />
              </button>
              <button
                className="link"
                style={{ color: "#ED5E3F" }}
                onClick={() => handleDelete(method.id)}
              >
                <LuTrash2 />
              </button>
            </div>
          </div>
        ))}
      </div>

      <h2>Кошельки</h2>

      <div className={styles.profile_payments_list}>
        {getWallets().map((wallet, index) => (
          <div key={index} className={styles.profile_wallets_item}>
            <div className={styles.profile_payments_item_logo}>
              {wallet?.currency}
            </div>
            <div className={styles.profile_payments_item_info}>
              <p>{wallet?.address}</p>
              <p>Баланс: {formatAssetAmount(wallet?.balance, walletPrecision[wallet.currency] || 8)}</p>
            </div>
            <div className={styles.profile_payments_item_action}></div>
          </div>
        ))}
      </div>
      <button
        className={`green-button ${styles.profile_payments_addbtn}`}
        onClick={() => setOpenedModal("add")}
      >
        Добавить способ оплаты
      </button>

      {openedModal == "add" && (
        <div className={styles.modal}>
          <div className={styles.modal_content}>
            <h1>Выберите способ оплаты</h1>
            <p style={{ marginBottom: "20px" }}>
              Время, которое потребуется для автообновления страницы
            </p>
            {paymentMethods.map((method, index) => (
              <div
                key={index}
                className={styles.profile_payments_modal_item}
                onClick={() =>
                  setOpenedModal({
                    type: method.code || method.id || method.type,
                    label: "",
                    details: {
                      brandName: method.name,
                    },
                  })
                }
              >
                <p>
                  {method.logo}
                  {method.name}
                </p>

                <button>+</button>
              </div>
            ))}

            <button
              className="link"
              style={{ marginTop: "30px" }}
              onClick={() => setOpenedModal(null)}
            >
              Вернуться назад
            </button>
          </div>
        </div>
      )}

      {openedModal?.type && (
        <div className={styles.modal}>
          <div className={styles.modal_content}>
            <h1>Добавить способ оплаты</h1>
            <p style={{ marginBottom: "20px" }}>
              Заполните реквизиты. Набор полей управляется админом.
            </p>

            <Input
              type="text"
              onChange={(value) =>
                setOpenedModal((prev) => ({ ...prev, label: value }))
              }
              value={openedModal.label}
              placeholder={
                <p
                  style={{ display: "flex", alignItems: "center", gap: "5px" }}
                >
                  <FaUser style={{ fontSize: "18px" }} /> ФИО
                </p>
              }
            />
            {(getDefinition(openedModal.type)?.fields || []).map((field) => (
              <Input
                key={field.key}
                type="text"
                minLength={field.minLength}
                maxLength={field.maxLength}
                pattern={field.pattern}
                title={field.pattern ? `Формат: ${field.placeholder || field.pattern}` : undefined}
                value={openedModal?.details?.[field.key] || ""}
                onChange={(value) =>
                  setOpenedModal((prev) => ({
                    ...prev,
                    details: {
                      ...prev.details,
                      [field.key]: value,
                    },
                  }))
                }
                placeholder={
                  <p style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                    <BiWallet style={{ fontSize: "18px" }} /> {field.label}{field.required !== false ? " *" : ""}
                    {field.placeholder ? ` (${field.placeholder})` : ""}
                  </p>
                }
              />
            ))}

            <button
              className="green-button"
              style={{ marginTop: "20px" }}
              onClick={handleSubmit}
            >
              {openedModal.editing ? "Сохранить" : "Добавить"}
            </button>
            <button
              className="link"
              style={{ marginTop: "10px" }}
              onClick={() => setOpenedModal("add")}
            >
              Вернуться назад
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

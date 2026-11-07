import React, { useEffect, useState } from "react";
import {ProfileStats} from './ProfileStats';
import {NativeWithdrawal} from './NativeWithdrawal';
import {TransactionHistory} from '../../Components/TransactionHistory/TransactionHistory';
import { useSearchParams } from "react-router-dom";
import styles from "./Profile.module.scss";
import {
  BiChevronDown,
  BiExit,
  BiGitBranch,
  BiWallet,
} from "react-icons/bi";
import { GrTransaction } from "react-icons/gr";
import { FaChartBar, FaChevronDown, FaUser } from "react-icons/fa";
import SberLogo from "./assets/Sber_logo.svg";
import TinkoffLogo from "./assets/Tinkoff_logo.svg";
import Cashlogo from "./assets/Cash.svg";
import CardLogo from "./assets/Credit_card.svg";
import { Input } from "../../Components/Input/Input";
import { NumericFormat } from "react-number-format";
import { GoArrowDownLeft, GoArrowUpRight } from "react-icons/go";
import { Loader } from "../../Components/Loader/Loader";
import api from "../../api";
import { BsClock, BsCoin } from "react-icons/bs";
import { FiInbox } from "react-icons/fi";
import { LuTrash2 } from "react-icons/lu";
import { TbCopy, TbEdit } from "react-icons/tb";
import { enqueueSnackbar } from "notistack";
import { formatAssetAmount, getBalanceValue } from "../../utils/wallets";
import QRCode from "react-qr-code";
import {WalletAssets,SolanaWallet} from "./WalletAssets";

const walletCurrencies = ["BTC", "ETH", "USDT", "TRX"];
const walletPrecision = { BTC: 8, ETH: 18, USDT: 6, TRX: 6 };

const getCurrencyColor = (currency) => {
  if (currency === "USDT") return "#28633b";
  if (currency === "TRX") return "#916e10";
  if (currency === "BTC") return "#a95a0b";
  return "#515d72";
};

const walletNetworkFallbacks = {
  BTC: { network: "Bitcoin", standard: "Bitcoin mainnet", addressFormat: "bc1…" },
  ETH: { network: "Ethereum", standard: "Ethereum mainnet", addressFormat: "0x…" },
  USDT: { network: "TRON", standard: "TRC-20", addressFormat: "T…", feeCurrency: "TRX" },
  TRX: { network: "TRON", standard: "TRON mainnet", addressFormat: "T…", feeCurrency: "TRX" },
};

const getWalletNetwork = (currency, wallet) =>
  wallet?.network || walletNetworkFallbacks[currency];

export const Profile = () => {
  const [searchParams] = useSearchParams();
  const [page, setPage] = React.useState("assets");
  const [navigationOpen, setNavigationOpen] = useState(false);

  useEffect(() => {
    const requestedSection = searchParams.get("section");
    if (requestedSection === "assets" || [...walletCurrencies,"SOL"].includes(requestedSection) || navigationItems.some((item) => item.key === requestedSection)) {
      setPage(requestedSection);
    }
  }, [searchParams]);



  return (
    <div className={styles.profile}>
      <section className={styles.profile_header}>
        <div>
          <h1 className="h1 title">Кошелек и профиль</h1>
          <p>
            Управление балансами, переводами, историей транзакций, способами
            оплаты и реферальной системой.
          </p>
        </div>
      </section>
      <nav
        className={`${styles.profile_navigation} ${
          navigationOpen ? styles.profile_navigation_open : ""
        }`}
        aria-label="Разделы кошелька и профиля"
      >
        <button
          type="button"
          className={styles.profile_navigation_item_active}
          onClick={() => setNavigationOpen((prev) => !prev)}
          aria-expanded={navigationOpen}
        >
          {navigationItems.find((item) => item.key == page)?.icon || <BsCoin />}
          {navigationItems.find((item) => item.key == page)?.name ||
            (page === "assets" ? "Активы" : `Действия с ${page}`)}{" "}
          <FaChevronDown />
        </button>
        <button type="button" className={page === "assets" ? styles.profile_navigation_item_active : styles.profile_navigation_item} onClick={()=>{setPage("assets");setNavigationOpen(false);}}><BiWallet/>Активы</button>
        {navigationItems.map((item) => (
          <button
            type="button"
            key={item.id}
            className={
              page == item.key
                ? styles.profile_navigation_item_active
                : styles.profile_navigation_item
            }
            onClick={() => {
              setPage(item.key);
              setNavigationOpen(false);
            }}
          >
            {item.icon} {item.name}
          </button>
        ))}
        <button
          type="button"
          className={styles.profile_navigation_item}
          onClick={() => {
                import('../../session').then(({signOut})=>signOut());
          }}
        >
          <BiExit /> Выйти
        </button>
      </nav>
      <div
        className={`${styles.profile_content} ${
          navigationOpen ? styles.profile_content_blur : ""
        }`}
      >
        {page === "assets" ? <WalletAssets onSelect={currency=>{setPage(currency);setNavigationOpen(false);}}/> : page === "SOL" ? <><button type="button" onClick={()=>setPage("assets")}>← Все активы</button><SolanaWallet/></> : navigationItems?.find((item) => item.key == page)?.page || <><button type="button" onClick={()=>setPage("assets")}>← Все активы</button><Action key={page} currency={page}/></>}
      </div>
    </div>
  );
};



const ProfileTransaction = () => {
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



const Action = ({ currency }) => {
  const [balance, setBalance] = React.useState(null);
  const [withdrawAddress, setWithdrawAddress] = React.useState("");
  const [withdrawAmount, setWithdrawAmount] = React.useState("");
  const [withdrawing, setWithdrawing] = React.useState(false);
  const withdrawalKeyRef = React.useRef(null);

  const precision = currency === "BTC" || currency === "ETH" ? 8 : 2;
  const wallet = React.useMemo(() => {
    const wallets = Array.isArray(balance?.wallets) ? balance.wallets : [];
    return wallets.find((item) => String(item.currency).toUpperCase() === currency) || null;
  }, [balance, currency]);
  const network = getWalletNetwork(currency, wallet);
  const depositsEnabled = wallet?.externalTransfers?.depositsEnabled === true;
  const withdrawalsEnabled = wallet?.externalTransfers?.withdrawalsEnabled === true;
  const unavailableReason = wallet?.externalTransfers?.reason || balance?.externalTransfers?.reason ||
    "Операции через блокчейн временно недоступны";
  const depositAddress = depositsEnabled ? wallet?.address || "" : "";
  const networkLabel = `${network.network} · ${network.standard}`;
  const minimumWithdrawalAmount = currency === "TRX" ? 1 : 0;

  React.useEffect(() => {
    api
      .get(`/api/transactions/balance`)
      .then((response) => setBalance(response.data))
      .catch((err) => {
        enqueueSnackbar(err.response?.data?.message || "Не удалось загрузить кошелек", {
          variant: "error",
        });
      });
  }, [currency]);

  const copyDepositAddress = async () => {
    if (!depositAddress) return;
    await navigator.clipboard.writeText(depositAddress);
    enqueueSnackbar("Адрес скопирован", { variant: "success" });
  };

  const handleWithdraw = (event) => {
    event.preventDefault();

    const targetAddress = withdrawAddress.trim();
    const amount = Number(withdrawAmount);

    if (!targetAddress || !Number.isFinite(amount) || amount <= 0) {
      enqueueSnackbar("Укажите адрес вывода и сумму", { variant: "error" });
      return;
    }
    if (minimumWithdrawalAmount > 0 && amount < minimumWithdrawalAmount) {
      enqueueSnackbar(`Минимальная сумма вывода: ${minimumWithdrawalAmount} ${currency}`, { variant: "error" });
      return;
    }

    setWithdrawing(true);
    withdrawalKeyRef.current ||= crypto.randomUUID();
    api
      .post(`/api/transactions/send`, {
        address: targetAddress,
        amount,
        currency,
      }, {
        headers: { "Idempotency-Key": withdrawalKeyRef.current },
      })
      .then(() => {
        enqueueSnackbar("Транзакция отправлена в сеть TRON и ожидает подтверждения", { variant: "success" });
        setWithdrawAddress("");
        setWithdrawAmount("");
        withdrawalKeyRef.current = null;
      })
      .catch((err) => {
        enqueueSnackbar(err.response?.data?.message || "Не удалось выполнить вывод", {
          variant: "error",
        });
      })
      .finally(() => setWithdrawing(false));
  };

  return (
    <div className={styles.profile_action}>
      <div className={styles.profile_action_top}>
        <div>
          Действия с {" "}
          <span
            style={{
              color:
                currency == "USDT"
                  ? "#86C239"
                  : currency == "TRX"
                  ? "#e9a907"
                  : "#1291d9",
            }}
          >
            {currency}
          </span>
        </div>
        <div className={styles.profile_action_network}>
          <span>Сеть</span>
          <strong>{networkLabel}</strong>
        </div>
      </div>
      <div className={styles.profile_action_wallet}>
        <div className={styles.profile_action_deposit}>
          <div>
            <p>
              <BiWallet /> Адрес для ввода
            </p>
            <strong>{network.standard}</strong>
          </div>
          <div className={styles.profile_action_networkBadge}>
            <span>Поддерживаемая сеть</span>
            <strong>{networkLabel}</strong>
          </div>
          {depositsEnabled ? (
            <>
              <p role="note">Минимум: эквивалент {balance?.depositPolicy?.minUsd||'5'} USDT. Комиссия: эквивалент {balance?.depositPolicy?.feeUsd??'2'} USDT с каждого пополнения, удерживается в валюте депозита после проверки. Другие валюты пересчитываются по курсу к USDT при зачислении. {currency==='BTC'?(wallet?.externalTransfers?.amlMode==='DISABLED'?'Bitcoin: зачисление после 6 подтверждений и сверки поступления. AML отключён — оценка риска не выполняется.':'Bitcoin: не менее 6 подтверждений, затем ручная AML-проверка с внешним отчётом. Мгновенное зачисление недоступно.'):'После подтверждения сети и AML-проверки: низкий риск может зачисляться автоматически, спорные поступления рассматривает администратор.'}</p>
              <div className={styles.profile_action_address}>
                <span>{depositAddress || "Адрес пока не создан"}</span>
                <button type="button" onClick={copyDepositAddress} disabled={!depositAddress}>
                  <TbCopy />
                </button>
              </div>
              <div className={styles.profile_action_qr}>
                {depositAddress ? (
                  <QRCode value={depositAddress} size={132} />
                ) : (
                  <span>QR недоступен</span>
                )}
              </div>
              <small>
                Отправляйте только {currency} через {networkLabel}. Адрес должен иметь формат {network.addressFormat}.
                {network.feeCurrency ? ` Для последующего вывода комиссия оплачивается в ${network.feeCurrency}.` : ""}
              </small>
            </>
          ) : (
            <div className={styles.profile_action_unavailable} role="status">
              <strong>Ввод временно недоступен</strong>
              <span>{unavailableReason}. Не отправляйте средства на ранее показанный адрес: баланс сайта не пополнится автоматически.</span>
            </div>
          )}
        </div>

        {['BTC','ETH'].includes(currency)&&withdrawalsEnabled ? <NativeWithdrawal key={currency} currency={currency}/> : withdrawalsEnabled ? (
          <form className={styles.profile_action_withdraw} onSubmit={handleWithdraw}>
            <div>
              <p>
                <GoArrowUpRight /> Вывод
              </p>
              <strong>
                Доступно: {formatAssetAmount(wallet?.balance || 0, precision)} {currency}
              </strong>
            </div>
            <div className={styles.profile_action_networkBadge}>
              <span>Сеть вывода</span>
              <strong>{networkLabel}</strong>
            </div>
            <label>
              <span>Адрес кошелька для вывода</span>
              <input
                value={withdrawAddress}
                placeholder={`${network.addressFormat} · ${networkLabel}`}
                autoComplete="off"
                onChange={(event) => setWithdrawAddress(event.target.value)}
              />
            </label>
            <label>
              <span>Сумма</span>
              <NumericFormat
                value={withdrawAmount}
                thousandSeparator=" "
                decimalSeparator=","
                decimalScale={precision}
                allowNegative={false}
                placeholder="0"
                onValueChange={(values) => setWithdrawAmount(values.value)}
              />
            </label>
            {minimumWithdrawalAmount > 0 && (
              <small className={styles.profile_action_withdrawHint}>
                Минимальная сумма вывода: {minimumWithdrawalAmount} {currency}
              </small>
            )}
            <button type="submit" disabled={withdrawing}>
              {withdrawing ? "Отправляем..." : `Вывести ${currency}`}
            </button>
          </form>
        ) : (
          <div className={styles.profile_action_withdraw}>
          <div>
            <p>
              <GoArrowUpRight /> Вывод
            </p>
            <strong>
              Доступно: {formatAssetAmount(wallet?.balance || 0, precision)} {currency}
            </strong>
          </div>
            <div className={styles.profile_action_networkBadge}>
              <span>Сеть вывода</span>
              <strong>{networkLabel}</strong>
            </div>
            <div className={styles.profile_action_unavailable} role="status">
              <strong>Вывод временно недоступен</strong>
              <span>{unavailableReason}. Средства нельзя отправить наружу через интерфейс сайта.</span>
            </div>
          </div>
        )}
      </div>
      <div className={styles.profile_action_body}>
        <div>
          <p>
            <BiWallet /> Ввод
          </p>
          <TransactionHistory
            currencyFilter={currency}
            directionFilter="IN"
            compact
            title={`История ввода ${currency}`}
            emptyText={`Вводов ${currency} пока нет`}
          />
        </div>

        <div>
          <p>
            <BiWallet /> Вывод
          </p>
          <TransactionHistory
            currencyFilter={currency}
            directionFilter="OUT"
            compact
            title={`История вывода ${currency}`}
            emptyText={`Выводов ${currency} пока нет`}
          />
        </div>
      </div>
    </div>
  );
};

const PaymentMethods = () => {
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

const Referral = () => {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const origin = window.location.origin;
  const referralLink = data?.code ? `${origin}/signin?ref=${data.code}` : "";

  const loadReferral = () => {
    setLoading(true);
    api
      .get("/referrals/me")
      .then((response) => setData(response.data))
      .catch((err) => {
        enqueueSnackbar(err.response?.data?.message || "Не удалось загрузить реферальную систему", {
          variant: "error",
        });
      })
      .finally(() => setLoading(false));
  };

  React.useEffect(() => {
    loadReferral();
  }, []);

  const copyLink = async () => {
    if (!referralLink) return;
    await navigator.clipboard.writeText(referralLink);
    enqueueSnackbar("Реферальная ссылка скопирована", { variant: "success" });
  };

  return (
    <div className={styles.profile_referral}>
      <div className={styles.profile_referral_link}>
        <h2>Пригласительная ссылка</h2>
        <p>{loading ? "Загружаем..." : referralLink || "Ссылка пока недоступна"}</p>
        <button className="green-button" onClick={copyLink} disabled={!referralLink}>
          COPY
        </button>
      </div>
      <div className={styles.profile_info_lines}>
        <div>
          <p>Заработано</p>
          <span>{formatAssetAmount(data?.rewardTotal, 8)} USDT</span>
        </div>{" "}
        <div>
          <p>ВАШ % ОТ КОМИССИЙ</p>
          <span>{data?.ratePercent || 0}%</span>
        </div>{" "}
        <div>
          <p>КОЛИЧЕСТВО ПОДКЛЮЧЕННЫХ АККАУНТОВ</p>
          <span>{data?.invitedCount || 0}</span>
        </div>{" "}
      </div>
      <div className={styles.profile_referral_link}>
        <h2>Ваш код</h2>
        <p>{data?.code || "-"}</p>
      </div>
      <div className={styles.profile_referral_link}>
        <h2>Приглашенные пользователи</h2>
        {data?.invitedUsers?.length ? (
          data.invitedUsers.map((user) => (
            <p key={user.id}>
              {user.username || user.email} ·{" "}
              {user.createdAt ? new Date(user.createdAt).toLocaleDateString("ru-RU") : "-"}
            </p>
          ))
        ) : (
          <p>Пока нет приглашенных пользователей</p>
        )}
      </div>
    </div>
  );
};

const navigationItems = [
  {
    name: "Перевод",
    id: 1,
    key: "transaction",
    icon: <GrTransaction />,
    page: <ProfileTransaction />,
  },
  {
    name: "Статистика",
    id: 2,
    key: "statistics",
    icon: <FaChartBar />,
    page: <ProfileStats />,
  },
  {
    name: "История транзакций",
    id: 3,
    key: "transactions",
    icon: <BsClock />,
    page: <TransactionHistory />,
  },
  {
    name: "Способы оплаты",
    id: 4,
    key: "payment-methods",
    icon: <BiWallet />,
    page: <PaymentMethods />,
  },
  {
    name: "Реферальная система",
    icon: <BiGitBranch />,
    id: 5,
    key: "referral",
    page: <Referral />,
  },
];

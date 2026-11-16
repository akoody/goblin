// Кошелёк одной валюты: баланс, пополнение, вывод.
import React from "react";
import { NativeWithdrawal } from './NativeWithdrawal';
import { MarketUsdtTransfer } from './MarketUsdtTransfer';
import { TransactionHistory } from '../../Components/TransactionHistory/TransactionHistory';
import styles from "./Profile.module.scss";
import { BiWallet } from "react-icons/bi";
import { NumericFormat } from "react-number-format";
import { GoArrowUpRight } from "react-icons/go";
import api from "../../api";
import { TbCopy } from "react-icons/tb";
import { enqueueSnackbar } from "notistack";
import { formatAssetAmount } from "../../utils/wallets";
import QRCode from "react-qr-code";

const walletNetworkFallbacks = {
  BTC: { network: "Bitcoin", standard: "Bitcoin mainnet", addressFormat: "bc1…" },
  ETH: { network: "Ethereum", standard: "Ethereum mainnet", addressFormat: "0x…" },
  USDT: { network: "TRON", standard: "TRC-20", addressFormat: "T…", feeCurrency: "TRX" },
  TRX: { network: "TRON", standard: "TRON mainnet", addressFormat: "T…", feeCurrency: "TRX" },
};

const getWalletNetwork = (currency, wallet) =>
  wallet?.network || walletNetworkFallbacks[currency];

export const Action = ({ currency }) => {
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

  const loadWallet = React.useCallback(() => {
    api
      .get(`/api/transactions/balance`)
      .then((response) => setBalance(response.data))
      .catch((err) => {
        enqueueSnackbar(err.response?.data?.message || "Не удалось загрузить кошелек", {
          variant: "error",
        });
      });
  }, [currency]);
  React.useEffect(loadWallet,[loadWallet]);

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
              <p role="note">Минимум: эквивалент {balance?.depositPolicy?.minUsd||'5'} USDT. Комиссия: эквивалент {balance?.depositPolicy?.feeUsd??'2'} USDT с каждого пополнения, удерживается в валюте депозита после проверки. Другие валюты пересчитываются по курсу к USDT при зачислении. {currency==='BTC'?(wallet?.externalTransfers?.amlMode==='DISABLED'?'Bitcoin: зачисление после 6 подтверждений и сверки поступления. AML отключён - оценка риска не выполняется.':'Bitcoin: не менее 6 подтверждений, затем ручная AML-проверка с внешним отчётом. Мгновенное зачисление недоступно.'):'После подтверждения сети и AML-проверки: низкий риск может зачисляться автоматически, спорные поступления рассматривает администратор.'}</p>
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
      {currency==='USDT'&&<MarketUsdtTransfer onTransferred={loadWallet}/>}
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

import Decimal from "decimal.js";
import { TronWeb } from "tronweb";

const DEFAULT_FULL_HOST = "https://api.trongrid.io";
export const TRON_USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const TOKEN_DECIMALS = 6;
const SUN_PER_TRX = new Decimal(1_000_000);

const getFullHost = () => String(process.env.TRON_FULL_HOST || DEFAULT_FULL_HOST).replace(/\/$/, "");
const getHeaders = () => {
  const apiKey = String(process.env.TRONGRID_API_KEY || "").trim();
  return apiKey ? { "TRON-PRO-API-KEY": apiKey } : {};
};

export const createTronWeb = (privateKey) => new TronWeb({
  fullHost: getFullHost(),
  headers: getHeaders(),
  ...(privateKey ? { privateKey: privateKey.replace(/^0x/, "") } : {}),
});

const fetchJson = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: {
      accept: "application/json",
      ...getHeaders(),
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...options.headers,
    },
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || body.message || `TRON API returned ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body;
};

export const isTronAddress = (address) => TronWeb.isAddress(String(address || "").trim());

export const listConfirmedTrxTransfers = async (address, minTimestamp = 0) => {
  const params = new URLSearchParams({
    only_confirmed: "true",
    only_to: "true",
    limit: "200",
    order_by: "block_timestamp,asc",
    min_timestamp: String(Math.max(0, Number(minTimestamp) || 0)),
  });
  return fetchAllPages(`${getFullHost()}/v1/accounts/${address}/transactions?${params}`);
};

export const listConfirmedUsdtTransfers = async (address, minTimestamp = 0) => {
  const params = new URLSearchParams({
    only_confirmed: "true",
    only_to: "true",
    limit: "200",
    order_by: "block_timestamp,asc",
    min_timestamp: String(Math.max(0, Number(minTimestamp) || 0)),
    contract_address: TRON_USDT_CONTRACT,
  });
  return fetchAllPages(`${getFullHost()}/v1/accounts/${address}/transactions/trc20?${params}`);
};

const fetchAllPages = async (initialUrl) => {
  const items = [];
  let url = initialUrl;
  for (let page = 0; url && page < 100; page += 1) {
    const response = await fetchJson(url);
    if (Array.isArray(response.data)) items.push(...response.data);
    url = response.meta?.links?.next || null;
  }
  return items;
};

const getEnergyFeeSun = async (tronWeb) => {
  const parameters = await tronWeb.trx.getChainParameters();
  const energyFee = parameters.find((item) => item.key === "getEnergyFee")?.value;
  return new Decimal(String(energyFee || 100));
};

export const prepareTronWithdrawal = async ({ currency, fromAddress, toAddress, amount, privateKey }) => {
  const symbol = String(currency).toUpperCase();
  const tronWeb = createTronWeb(privateKey);
  const baseUnits = new Decimal(String(amount)).mul(SUN_PER_TRX).toDecimalPlaces(0, Decimal.ROUND_DOWN);
  if (baseUnits.lte(0)) throw new Error("Withdrawal amount is too small");

  if (symbol === "TRX") {
    const feeReserveSun = new Decimal(1_100_000);
    const chainBalance = new Decimal(String(await tronWeb.trx.getBalance(fromAddress)));
    if (chainBalance.lt(baseUnits.plus(feeReserveSun))) {
      throw new Error("Недостаточно TRX на блокчейн-адресе с учётом сетевой комиссии");
    }
    const transaction = await tronWeb.transactionBuilder.sendTrx(
      toAddress,
      baseUnits.toNumber(),
      fromAddress
    );
    const signed = await tronWeb.trx.sign(transaction, privateKey.replace(/^0x/, ""));
    return {
      txHash: signed.txID,
      signedTransaction: signed,
      feeReserve: feeReserveSun.div(SUN_PER_TRX).toFixed(6),
    };
  }

  if (symbol !== "USDT") throw new Error(`TRON withdrawal is not supported for ${symbol}`);

  const contract = await tronWeb.contract().at(TRON_USDT_CONTRACT);
  const tokenBalance = new Decimal(String(await contract.balanceOf(fromAddress).call()));
  if (tokenBalance.lt(baseUnits)) {
    throw new Error("Недостаточно USDT на блокчейн-адресе");
  }

  const parameters = [
    { type: "address", value: toAddress },
    { type: "uint256", value: baseUnits.toFixed(0) },
  ];
  const estimate = await tronWeb.transactionBuilder.estimateEnergy(
    TRON_USDT_CONTRACT,
    "transfer(address,uint256)",
    {},
    parameters,
    fromAddress
  );
  if (!estimate.result?.result || !estimate.energy_required) {
    throw new Error("Не удалось рассчитать комиссию TRC-20");
  }
  const energyFeeSun = await getEnergyFeeSun(tronWeb);
  const feeReserveSun = Decimal.max(
    new Decimal(2_000_000),
    new Decimal(estimate.energy_required).mul(energyFeeSun).mul(1.25).plus(1_000_000)
  ).toDecimalPlaces(0, Decimal.ROUND_UP);
  const chainTrxBalance = new Decimal(String(await tronWeb.trx.getBalance(fromAddress)));
  if (chainTrxBalance.lt(feeReserveSun)) {
    throw new Error(`Для вывода USDT нужно пополнить TRX-комиссию минимум на ${feeReserveSun.div(SUN_PER_TRX).toFixed(2)} TRX`);
  }

  const built = await tronWeb.transactionBuilder.triggerSmartContract(
    TRON_USDT_CONTRACT,
    "transfer(address,uint256)",
    { feeLimit: feeReserveSun.toNumber() },
    parameters,
    fromAddress
  );
  if (!built.result?.result || !built.transaction) {
    throw new Error("Не удалось сформировать транзакцию USDT TRC-20");
  }
  const signed = await tronWeb.trx.sign(built.transaction, privateKey.replace(/^0x/, ""));
  return {
    txHash: signed.txID,
    signedTransaction: signed,
    feeReserve: feeReserveSun.div(SUN_PER_TRX).toFixed(6),
  };
};

export const broadcastTronTransaction = async (signedTransaction) => {
  const tronWeb = createTronWeb();
  const result = await tronWeb.trx.sendRawTransaction(signedTransaction);
  if (result.result || result.code === "DUP_TRANSACTION_ERROR") return result;
  const message = result.message
    ? Buffer.from(result.message, "base64").toString("utf8")
    : result.code || "TRON broadcast was rejected";
  throw new Error(message);
};

export const getSolidTronReceipt = async (txHash) => fetchJson(
  `${getFullHost()}/walletsolidity/gettransactioninfobyid`,
  { method: "POST", body: JSON.stringify({ value: txHash }) }
);

export const trxFromSun = (value) => new Decimal(String(value || 0)).div(SUN_PER_TRX).toFixed(6);
export const tokenFromBaseUnits = (value, decimals = TOKEN_DECIMALS) =>
  new Decimal(String(value || 0)).div(new Decimal(10).pow(Number(decimals))).toFixed(Number(decimals));

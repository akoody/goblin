const networks = Object.freeze({
  SOL: Object.freeze({network:'Solana',standard:'Solana mainnet',addressFormat:'Base58…',feeCurrency:'SOL'}),
  BTC: Object.freeze({
    network: "Bitcoin",
    standard: "Bitcoin mainnet",
    addressFormat: "bc1…",
  }),
  ETH: Object.freeze({
    network: "Ethereum",
    standard: "Ethereum mainnet",
    addressFormat: "0x…",
  }),
  USDT: Object.freeze({
    network: "TRON",
    standard: "TRC-20",
    addressFormat: "T…",
    feeCurrency: "TRX",
  }),
  TRX: Object.freeze({
    network: "TRON",
    standard: "TRON mainnet",
    addressFormat: "T…",
    feeCurrency: "TRX",
  }),
});

const tronGridConfigured = Boolean(String(process.env.TRONGRID_API_KEY || "").trim());
const nativeEnabled = process.env.NATIVE_CHAINS_ENABLED === 'true';

export const externalWalletProcessing = Object.freeze({
  depositsEnabled: tronGridConfigured,
  withdrawalsEnabled: tronGridConfigured,
  assets: Object.freeze({
    SOL: Object.freeze({depositsEnabled:Boolean(process.env.SOLANA_RPC_URL),withdrawalsEnabled:false}),
    BTC: Object.freeze({ depositsEnabled: nativeEnabled, withdrawalsEnabled: nativeEnabled }),
    ETH: Object.freeze({ depositsEnabled: nativeEnabled, withdrawalsEnabled: nativeEnabled }),
    USDT: Object.freeze({ depositsEnabled: tronGridConfigured, withdrawalsEnabled: tronGridConfigured }),
    TRX: Object.freeze({ depositsEnabled: tronGridConfigured, withdrawalsEnabled: tronGridConfigured }),
  }),
  reason: tronGridConfigured
    ? "Для этой сети блокчейн-процессинг пока не подключён"
    : "Для безопасной работы TRON нужно настроить ключ TronGrid на сервере",
});

export const isTronProcessingConfigured = () => tronGridConfigured;

export const getWalletNetwork = (currency) => networks[String(currency || "").toUpperCase()] || null;

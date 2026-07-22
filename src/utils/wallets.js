export const getWalletAmount = (wallets, currency, field = "balance") => {
  const wallet = Array.isArray(wallets)
    ? wallets.find((item) => String(item.currency).toUpperCase() === currency)
    : null;

  return Number(wallet?.[field] || 0);
};

export const formatAssetAmount = (value, maximumFractionDigits = 8) =>
  new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits,
  }).format(Number(value || 0));

export const getBalanceValue = (balance, currency) => {
  if (!balance) {
    return 0;
  }

  return Number(
    balance[currency] ??
      balance[`${currency.toLowerCase()}Balance`] ??
      getWalletAmount(balance.wallets, currency)
  );
};

export const nativeCurrencies = Object.freeze(['BTC', 'ETH', 'USDT', 'TRX', 'SOL']);

// Missing assets are display-only zero balances, not newly generated wallets.
export function completeWalletInventory(rows) {
  const wallets = new Map(rows.map(row => [row.currency, row]));
  for (const currency of nativeCurrencies) {
    if (!wallets.has(currency)) {
      wallets.set(currency, {currency, total: '0', available: '0', locked: '0'});
    }
  }
  return [...wallets.values()];
}

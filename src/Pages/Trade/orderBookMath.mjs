const ZERO = BigInt(0), ONE = BigInt(1);
const SCALE = BigInt(10) ** BigInt(18);
function units(value) {
  const raw = String(value);
  if (!/^\d+(\.\d{1,18})?$/.test(raw)) return null;
  const [whole, fraction = ''] = raw.split('.');
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(18, '0'));
}
function decimal(value, scale = SCALE) {
  const digits = scale.toString().length - 1;
  const fraction = (value % scale).toString().padStart(digits, '0').replace(/0+$/, '');
  return `${value / scale}${fraction ? `.${fraction}` : ''}`;
}
export function priceSteps(price) {
  const value = Number(price);
  const exponent = value >= 1000 ? -2 : value >= 1 ? -4 : Math.max(-18, Math.floor(Math.log10(value || 1)) - 3);
  return ['0', ...Array.from({length: 5}, (_, i) => {
    const power = exponent + i;
    return power >= 0 ? `1${'0'.repeat(power)}` : `0.${'0'.repeat(-power - 1)}1`;
  })];
}

// Asks round up and bids down: grouping must never turn them into crossed quotes.
export function aggregateBook(rows, side, step = '0', limit = 16) {
  const tick = units(step);
  if (tick === null || !['asks', 'bids'].includes(side)) throw new Error('Invalid book grouping');
  const groups = new Map();
  for (const row of rows || []) {
    const price = units(row.price), quantity = units(row.quantity);
    if (price === null || quantity === null || price === ZERO || quantity === ZERO) continue;
    const grouped = tick === ZERO ? price : side === 'asks' ? ((price + tick - ONE) / tick) * tick : (price / tick) * tick;
    if (grouped === ZERO) continue;
    const current = groups.get(grouped) || {price: grouped, quantity: ZERO, quote: ZERO};
    current.quantity += quantity;
    current.quote += price * quantity;
    groups.set(grouped, current);
  }
  let total = ZERO, totalQuote = ZERO;
  const sorted = [...groups.values()].sort((a, b) => a.price === b.price ? 0 : (a.price < b.price ? -1 : 1) * (side === 'asks' ? 1 : -1));
  return sorted.slice(0, Math.max(1, Math.min(50, Number(limit) || 16))).map(row => {
    total += row.quantity;
    totalQuote += row.quote;
    return {price: decimal(row.price), quantity: decimal(row.quantity), total: decimal(total), totalQuote: decimal(totalQuote, SCALE * SCALE)};
  });
}

export function chartPoints(candles = []) {
  const valid = (Array.isArray(candles) ? candles : []).filter(candle => candle && Number.isFinite(Number(candle.close)) && Number(candle.close) > 0);
  if (valid.length < 2) return [];
  const closes = valid.map(candle => Number(candle.close));
  const minimum = Math.min(...closes), range = Math.max(...closes) - minimum || 1;
  return valid.map((candle, index) => ({ price: String(candle.close), time: Number(candle.time) || null,
    x: index / (valid.length - 1) * 1000, y: 250 - (Number(candle.close) - minimum) / range * 210 }));
}
export function chartIndex(clientX, left, width, count) {
  if (!Number.isFinite(clientX) || !Number.isFinite(left) || !(width > 0) || count < 1) return null;
  return Math.round(Math.max(0, Math.min(1, (clientX - left) / width)) * (count - 1));
}

// Общие форматтеры разделов админки.

export const formatDate = (value) => {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("ru-RU");
};

export const formatTradingAmount = (value, digits = 8) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: digits }).format(Number(value || 0));

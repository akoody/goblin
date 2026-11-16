// Запросы к /api/commerce и общие подписи статусов маркета и гаранта.
import { useCallback, useEffect, useRef, useState } from "react";
import { enqueueSnackbar } from "notistack";
import api from "../../api";

export const prefix = "/api/commerce";

export const money = (value, currency = "RUB") =>
  `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: currency === "RUB" ? 2 : 6 }).format(Number(value || 0))} ${currency === "RUB" ? "₽" : "USDT"}`;

export const date = (value) => new Date(value).toLocaleString("ru-RU");

export const labels = {
  WAITING: "Ожидает участника",
  READY: "Ожидает резервирования",
  FUNDED: "Средства зарезервированы",
  DELIVERED: "Передано - ожидает приёмки",
  DISPUTED: "Открыт спор",
  COMPLETED: "Завершена",
  REFUNDED: "Возврат",
  CANCELLED: "Отменена",
  PENDING: "На проверке",
  APPROVED: "Подтверждена",
  REJECTED: "Отклонена",
};


export const actions = {
  create: "Создание",
  join: "Участник присоединился",
  fund: "Средства зарезервированы",
  deliver: "Продавец передал заказ",
  complete: "Покупатель подтвердил получение",
  dispute: "Открыт спор",
  refund: "Возврат покупателю",
  cancel: "Отмена",
  "resolve-pay": "Администратор выплатил продавцу",
  "resolve-refund": "Администратор вернул покупателю",
  "admin-cancel": "Администратор отменил сделку",
};

export function useData(path, enabled = true) {
  const requestId = useRef(0);
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(enabled);
  const reload = useCallback(async () => {
    if (!enabled) return;
    const currentRequest = ++requestId.current;
    try {
      const response = await api.get(prefix + path);
      if (currentRequest !== requestId.current) return;
      setData(response.data);
      setError("");
    } catch (e) {
      if (currentRequest !== requestId.current) return;
      setError(e.response?.data?.message || "Не удалось загрузить данные");
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [path, enabled]);
  useEffect(() => {
    setData(null);
    setLoading(enabled);
    reload();
    return () => {
      requestId.current += 1;
    };
  }, [reload, enabled]);
  return { data, error, loading, reload };
}

export function useMutation() {
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const run = async (work) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      return await work();
    } catch (e) {
      enqueueSnackbar(
        e.response?.data?.message || "Не удалось выполнить операцию",
        { variant: "error" },
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  return { busy, run };
}

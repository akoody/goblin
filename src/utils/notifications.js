const errorMessages = {
  "Invalid credentials": "Неверное имя пользователя или пароль.",
  Unauthorized: "Сессия истекла. Войдите в аккаунт заново.",
  Forbidden: "У вас нет доступа к этому действию.",
  "Network Error": "Не удалось подключиться к серверу. Проверьте соединение и попробуйте еще раз.",
};

export const getApiErrorMessage = (error, fallback = "Что-то пошло не так. Попробуйте еще раз.") => {
  const serverMessage = error?.response?.data?.message || error?.message;

  if (
    typeof serverMessage === "string" &&
    serverMessage.includes("Failed to create BTC/ETH")
  ) {
    return "Аккаунт не создан: сервер не смог создать BTC/ETH кошельки. Нужно проверить генерацию кошельков на backend.";
  }

  if (typeof serverMessage === "string" && errorMessages[serverMessage]) {
    return errorMessages[serverMessage];
  }

  if (error?.response?.status === 401) {
    return errorMessages.Unauthorized;
  }

  if (error?.response?.status === 403) {
    return errorMessages.Forbidden;
  }

  return serverMessage || fallback;
};

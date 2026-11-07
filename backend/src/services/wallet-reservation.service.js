import Decimal from "decimal.js";

const fail = (message, status = 409) => {
  throw Object.assign(new Error(message), { status });
};

const positiveAmount = (value) => {
  let amount;
  try {
    amount = new Decimal(String(value));
  } catch {
    fail("Некорректная сумма резерва", 400);
  }
  if (!amount.isFinite() || amount.lte(0)) fail("Некорректная сумма резерва", 400);
  return amount;
};

export async function reserveUsdt(connection, userId, value) {
  const amount = positiveAmount(value);
  const [[wallet]] = await connection.execute(
    `SELECT id,balance,locked_balance,status FROM wallets
     WHERE user_id=? AND currency='USDT' FOR UPDATE`,
    [userId],
  );
  if (!wallet || wallet.status !== "active")
    fail("Активный кошелёк USDT не найден", 404);
  if (new Decimal(wallet.balance).minus(wallet.locked_balance || 0).lt(amount))
    fail("Недостаточно свободных USDT");

  const amountText = amount.toFixed();
  const [result] = await connection.execute(
    `UPDATE wallets SET locked_balance=COALESCE(locked_balance,0)+?
     WHERE id=? AND balance-COALESCE(locked_balance,0)>=?`,
    [amountText, wallet.id, amountText],
  );
  if (result.affectedRows !== 1) fail("Недостаточно свободных USDT");
  return wallet;
}

export async function consumeUsdtReservation(connection, userId, value) {
  const amount = positiveAmount(value).toFixed();
  const [result] = await connection.execute(
    `UPDATE wallets SET balance=balance-?,locked_balance=locked_balance-?
     WHERE user_id=? AND currency='USDT' AND balance>=? AND locked_balance>=?`,
    [amount, amount, userId, amount, amount],
  );
  if (result.affectedRows !== 1) fail("Резерв USDT сделки не найден");
}

export async function releaseUsdtReservation(connection, userId, value) {
  const amount = positiveAmount(value).toFixed();
  const [result] = await connection.execute(
    `UPDATE wallets SET locked_balance=locked_balance-?
     WHERE user_id=? AND currency='USDT' AND locked_balance>=?`,
    [amount, userId, amount],
  );
  if (result.affectedRows !== 1) fail("Резерв USDT сделки не найден");
}

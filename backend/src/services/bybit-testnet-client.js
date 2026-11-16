import {createHmac} from 'node:crypto';

const origin = 'https://api-testnet.bybit.com';

export function bybitError(message, status, code) {
  return Object.assign(new Error(message), {status, code});
}

export async function bybitRequest(credentials, path, parameters = {}, method = 'GET') {
  const timestamp = String(Date.now());
  const window = '5000';
  const payload = method === 'GET' ? new URLSearchParams(parameters).toString() : JSON.stringify(parameters);
  const signature = createHmac('sha256', credentials.secret)
    .update(timestamp + credentials.key + window + payload).digest('hex');
  const url = origin + path + (method === 'GET' && payload ? '?' + payload : '');
  let response, data;
  try {
    response = await fetch(url, {
      method, redirect: 'error', signal: AbortSignal.timeout(8000),
      headers: {
        'X-BAPI-API-KEY': credentials.key, 'X-BAPI-SIGN': signature,
        'X-BAPI-TIMESTAMP': timestamp, 'X-BAPI-RECV-WINDOW': window,
        'Content-Type': 'application/json',
      },
      ...(method === 'POST' ? {body: payload} : {}),
    });
    data = await response.json();
  } catch {
    throw unavailable(method);
  }
  if (!response.ok || typeof data?.retCode !== 'number') throw unavailable(method);
  if (data.retCode === 0 && data.result) return data.result;
  if ([10003,10004,10005,10007,10010,33004].includes(data.retCode)) {
    throw bybitError('Bybit отклонил ключ. Проверьте Testnet, права и разрешённые IP.', 422);
  }
  if ([10000,10016,10019,110072,10014].includes(data.retCode)) throw unavailable(method);
  throw bybitError(`Bybit отклонил запрос (код ${data.retCode}).`, 422);
}

function unavailable(method) {
  return method === 'POST'
    ? bybitError('Статус операции неизвестен. Обновите ордера и позиции на Bybit перед повтором.', 502, 'BYBIT_UNKNOWN')
    : bybitError('Bybit Testnet временно недоступен.', 502);
}

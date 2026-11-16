import { randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";

const MIN_SECRET_BYTES = 32;
const LOCAL_ENVIRONMENTS = new Set(["development", "test"]);

// Без JWT_SECRET локально используется случайный секрет на время жизни
// процесса: токены сбрасываются при перезапуске, но подделать их нельзя.
let localSecret = null;

/**
 * Секрет подписи токенов. Вне явных development/test без JWT_SECRET
 * сервис не работает: пропущенный NODE_ENV не должен включать слабый секрет.
 */
export const getJwtSecret = (env = process.env) => {
  const secret = String(env.JWT_SECRET || "").trim();
  if (secret) {
    if (Buffer.byteLength(secret, "utf8") < MIN_SECRET_BYTES) {
      throw new Error(`JWT_SECRET must contain at least ${MIN_SECRET_BYTES} bytes`);
    }
    return secret;
  }

  if (!LOCAL_ENVIRONMENTS.has(env.NODE_ENV)) {
    throw new Error("JWT_SECRET is required unless NODE_ENV is development or test");
  }

  localSecret ??= randomBytes(MIN_SECRET_BYTES).toString("hex");
  return localSecret;
};

export const signAccessToken = (payload) =>
  jwt.sign(payload, getJwtSecret(), { expiresIn: "2h" });

export const verifyAccessToken = (token) => jwt.verify(token, getJwtSecret());

import jwt from "jsonwebtoken";

const developmentSecret = "dev-secret";

export const getJwtSecret = () => {
  const secret = String(process.env.JWT_SECRET || "").trim();
  if (secret) {
    if (Buffer.byteLength(secret, "utf8") < 32) {
      throw new Error("JWT_SECRET must contain at least 32 bytes");
    }
    return secret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET is required in production");
  }

  return developmentSecret;
};

export const signAccessToken = (payload) =>
  jwt.sign(payload, getJwtSecret(), { expiresIn: "2h" });

export const verifyAccessToken = (token) => jwt.verify(token, getJwtSecret());

import { timingSafeEqual } from "node:crypto";
import type { User } from "@/lib/db";

export const ENV_ADMIN_ID = "env-admin";

type SerializableUser = Pick<
  User,
  "id" | "name" | "email" | "passwordHash" | "role" | "bio" | "city" | "preferredCurrency" | "createdAt" | "updatedAt"
>;

function getEnvValue(value: string | undefined) {
  return value?.trim() || "";
}

export function getEnvAdminConfig() {
  const email = getEnvValue(process.env.ADMIN_EMAIL).toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "";

  if (!email || !password) {
    return null;
  }

  return {
    email,
    password,
    name: getEnvValue(process.env.ADMIN_NAME) || "Администратор Goblin",
  };
}

export function getEnvAdminUser(): SerializableUser | null {
  const config = getEnvAdminConfig();

  if (!config) {
    return null;
  }

  return {
    id: ENV_ADMIN_ID,
    name: config.name,
    email: config.email,
    passwordHash: "",
    role: "ADMIN",
    bio: "Системный администратор",
    city: null,
    preferredCurrency: "RUB",
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

export function isAdminUser(user: Pick<User, "id" | "role"> | null | undefined) {
  return user?.id === ENV_ADMIN_ID || user?.role === "ADMIN";
}

export function isAdminEmail(email: string) {
  const config = getEnvAdminConfig();
  return config?.email === email.trim().toLowerCase();
}

export function verifyEnvAdminPassword(password: string) {
  const config = getEnvAdminConfig();

  if (!config) {
    return false;
  }

  const provided = Buffer.from(password);
  const expected = Buffer.from(config.password);

  if (provided.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(provided, expected);
}

export function getAuthenticatedHomePath(user: Pick<User, "id" | "role"> | null | undefined) {
  return isAdminUser(user) ? "/admin" : "/";
}

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

export const getAdminEmails = () => {
  const value = import.meta.env.VITE_ADMIN_EMAILS || "";

  return value
    .split(/[,;\n]/)
    .map(normalizeEmail)
    .filter(Boolean);
};

export const isAdminEmail = (email) => {
  const adminEmails = getAdminEmails();

  if (adminEmails.length === 0) {
    return false;
  }

  return adminEmails.includes(normalizeEmail(email));
};

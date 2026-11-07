import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "../config/db.js";
import { getJwtSecret } from "../config/jwt.js";

const CODE_TTL_MINUTES = 15;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_CODE_ATTEMPTS = 5;

const normalizeIdentifier = (value) => String(value || "").trim().toLowerCase();

const getResetSecret = () => process.env.PASSWORD_RESET_SECRET || getJwtSecret();

const hashCode = (code) => crypto
    .createHash("sha256")
    .update(`${getResetSecret()}:${code}`)
    .digest("hex");

const createCode = () => String(crypto.randomInt(100000, 1000000));

const sendCodeEmail = async (email, code) => {
    const apiKey = String(process.env.RESEND_API_KEY || "").trim();
    const from = String(process.env.EMAIL_FROM || "").trim();
    const appUrl = String(process.env.APP_URL || "https://cryptogoblin.ru").replace(/\/$/, "");

    if (!apiKey || !from) {
        throw new Error("Password reset email is not configured: RESEND_API_KEY and EMAIL_FROM are required");
    }

    const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({
            from,
            to: [email],
            subject: "Код восстановления пароля CryptoGoblin",
            text: [
                "Здравствуйте!",
                "",
                `Ваш код восстановления пароля: ${code}`,
                `Код действует ${CODE_TTL_MINUTES} минут и одноразовый.`,
                "Если вы не запрашивали восстановление пароля, просто проигнорируйте это письмо.",
                "",
                `CryptoGoblin: ${appUrl}`,
            ].join("\n"),
            html: `
            <div style="font-family:Arial,sans-serif;line-height:1.5;color:#20251f">
              <h2>Восстановление пароля CryptoGoblin</h2>
              <p>Введите этот код на странице восстановления пароля:</p>
              <p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:24px 0">${code}</p>
              <p>Код действует ${CODE_TTL_MINUTES} минут и одноразовый.</p>
              <p style="color:#687266">Если вы не запрашивали восстановление пароля, просто проигнорируйте это письмо.</p>
              <p><a href="${appUrl}">${appUrl}</a></p>
            </div>
        `,
        }),
    });

    if (!response.ok) {
        throw new Error(`Email provider request failed with status ${response.status}`);
    }
};

export async function requestPasswordReset(identifier) {
    const normalized = normalizeIdentifier(identifier);
    if (!normalized) return { delivered: false };

    const [users] = await db.execute(
        `SELECT id, email
         FROM users
         WHERE (LOWER(email) = ? OR LOWER(username) = ?)
           AND COALESCE(status, 'active') = 'active'
         LIMIT 1`,
        [normalized, normalized]
    );

    // Do not reveal whether an account exists.
    if (users.length === 0 || !users[0].email) return { delivered: false };

    const user = users[0];
    const cooldownSince = new Date(Date.now() - RESEND_COOLDOWN_SECONDS * 1000);
    const [recent] = await db.execute(
        `SELECT id
         FROM password_reset_codes
         WHERE user_id = ? AND created_at >= ?
         ORDER BY id DESC
         LIMIT 1`,
        [user.id, cooldownSince]
    );

    if (recent.length > 0) return { delivered: true, throttled: true };

    const code = createCode();
    await db.execute(
        "UPDATE password_reset_codes SET consumed_at = COALESCE(consumed_at, NOW()) WHERE user_id = ? AND consumed_at IS NULL",
        [user.id]
    );
    await db.execute(
        `INSERT INTO password_reset_codes (user_id, email, code_hash, expires_at)
         VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 15 MINUTE))`,
        [user.id, user.email, hashCode(code)]
    );

    try {
        await sendCodeEmail(user.email, code);
    } catch (error) {
        await db.execute(
            "UPDATE password_reset_codes SET consumed_at = COALESCE(consumed_at, NOW()) WHERE user_id = ? AND code_hash = ? AND consumed_at IS NULL",
            [user.id, hashCode(code)]
        );
        throw error;
    }

    return { delivered: true };
}

export async function confirmPasswordReset(identifier, code, newPassword) {
    const normalized = normalizeIdentifier(identifier);
    const normalizedCode = String(code || "").trim();

    if (!normalized || !/^\d{6}$/.test(normalizedCode)) {
        throw new Error("Invalid or expired reset code");
    }

    const connection = await db.getConnection();
    let invalidCode = false;
    try {
        await connection.beginTransaction();

        const [users] = await connection.execute(
            `SELECT id
             FROM users
             WHERE (LOWER(email) = ? OR LOWER(username) = ?)
               AND COALESCE(status, 'active') = 'active'
             LIMIT 1
             FOR UPDATE`,
            [normalized, normalized]
        );

        if (users.length === 0) throw new Error("Invalid or expired reset code");

        const [codes] = await connection.execute(
            `SELECT id, code_hash, attempts
             FROM password_reset_codes
             WHERE user_id = ? AND consumed_at IS NULL AND expires_at > NOW()
             ORDER BY id DESC
             LIMIT 1
             FOR UPDATE`,
            [users[0].id]
        );

        if (codes.length === 0 || Number(codes[0].attempts) >= MAX_CODE_ATTEMPTS) {
            throw new Error("Invalid or expired reset code");
        }

        const expected = Buffer.from(codes[0].code_hash, "hex");
        const received = Buffer.from(hashCode(normalizedCode), "hex");
        if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
            const attempts = Number(codes[0].attempts) + 1;
            await connection.execute(
                `UPDATE password_reset_codes
                 SET attempts = ?, consumed_at = IF(? >= ?, NOW(), consumed_at)
                 WHERE id = ?`,
                [attempts, attempts, MAX_CODE_ATTEMPTS, codes[0].id]
            );
            invalidCode = true;
        } else {
            const passwordHash = await bcrypt.hash(newPassword, 12);
            await connection.execute("UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?", [passwordHash, users[0].id]);
            await connection.execute("UPDATE password_reset_codes SET consumed_at = NOW() WHERE user_id = ? AND consumed_at IS NULL", [users[0].id]);
        }

        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }

    if (invalidCode) throw new Error("Invalid or expired reset code");
}

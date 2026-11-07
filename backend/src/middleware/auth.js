import { verifyAccessToken } from "../config/jwt.js";
import { db } from "../config/db.js";
import { setMarketCookie } from '../services/market-session.service.js';

export const auth = async (req, res, next) => {
    try {
        const header = req.headers.authorization;

        if (!header || !header.startsWith("Bearer ")) {
            return res.status(401).json({ message: "Authorization header missing" });
        }

        const token = header.split(" ")[1];

        if (!token) {
            return res.status(401).json({ message: "Token missing" });
        }

        const decoded = verifyAccessToken(token);

        const [rows] = await db.execute(
            "SELECT COALESCE(status, 'active') AS status, COALESCE(token_version, 0) AS token_version FROM users WHERE id = ? LIMIT 1",
            [decoded.userId]
        );

        if (rows.length === 0) {
            return res.status(401).json({ message: "User not found" });
        }

        if (rows[0].status !== "active") {
            return res.status(403).json({ message: "Account is not active" });
        }

        if (Number(decoded.tokenVersion || 0) !== Number(rows[0].token_version || 0)) {
            return res.status(401).json({ message: "Session expired", code: "TOKEN_REVOKED" });
        }

        req.user = decoded;
        req.user.user_id = decoded.userId;
        setMarketCookie(res,token,decoded.exp,req.secure);

        next();
    } catch (err) {
      //  console.error("AUTH ERROR:", err);

        if (err.name === "TokenExpiredError") {
            return res.status(401).json({
                message: "Token expired",
                code: "TOKEN_EXPIRED",
            });
        }

        return res.status(401).json({
            message: "Invalid token",
            code: "INVALID_TOKEN",
        });
    //    return res.status(401).json({ message: "Invalid or expired token" });
    }
};

import jwt from "jsonwebtoken";
import { db } from "../config/db.js";

export const auth = async (req, res, next) => {
    try {
        const header = req.headers.authorization;

        if (!header) {
            return res.status(401).json({ message: "Authorization header missing" });
        }

        const token = header.split(" ")[1];

        if (!token) {
            return res.status(401).json({ message: "Token missing" });
        }

        const decoded = jwt.verify(token, "dev-secret");

        const [rows] = await db.execute(
            "SELECT COALESCE(status, 'active') AS status FROM users WHERE id = ? LIMIT 1",
            [decoded.userId]
        );

        if (rows.length === 0) {
            return res.status(401).json({ message: "User not found" });
        }

        if (rows[0].status !== "active") {
            return res.status(403).json({ message: "Account is not active" });
        }

        req.user = decoded;

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

import { verifyAccessToken } from "../config/jwt.js";

export function auth(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer "))
        return res.status(401).json({ message: "Unauthorized" });

    const token = header.slice(7);

    try {
        req.user = verifyAccessToken(token);
        next();
    } catch {
        return res.status(401).json({ message: "Invalid token" });
    }
}

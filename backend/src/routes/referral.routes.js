import express from "express";
import { db } from "../config/db.js";

const router = express.Router();

const makeReferralCode = (userId) => `GBL${Number(userId).toString(36).toUpperCase().padStart(6, "0")}`;

router.get("/me", async (req, res) => {
  try {
    const userId = req.user.userId;

    const [[user]] = await db.execute(
      "SELECT id, referral_code, referred_by FROM users WHERE id = ?",
      [userId]
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    let referralCode = user.referral_code;
    if (!referralCode) {
      referralCode = makeReferralCode(userId);
      await db.execute("UPDATE users SET referral_code = ? WHERE id = ?", [referralCode, userId]);
    }

    const [invites] = await db.execute(
      `SELECT id, username, email, created_at
       FROM users
       WHERE referred_by = ?
       ORDER BY created_at DESC`,
      [userId]
    );

    const [rewards] = await db.execute(
      `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
       FROM referral_rewards
       WHERE referrer_id = ?`,
      [userId]
    );

    const [[referrer]] = user.referred_by
      ? await db.execute("SELECT id, username, email, referral_code FROM users WHERE id = ?", [user.referred_by])
      : [[]];

    res.json({
      code: referralCode,
      ratePercent: 10,
      invitedCount: invites.length,
      rewardTotal: Number(rewards[0]?.total || 0),
      rewardCount: Number(rewards[0]?.count || 0),
      invitedUsers: invites.map((invite) => ({
        id: invite.id,
        username: invite.username,
        email: invite.email,
        createdAt: invite.created_at,
      })),
      referrer: referrer
        ? {
            id: referrer.id,
            username: referrer.username,
            email: referrer.email,
            code: referrer.referral_code,
          }
        : null,
    });
  } catch (err) {
    console.error("GET /referrals/me error:", err);
    res.status(500).json({ message: "Failed to fetch referral data" });
  }
});

export default router;

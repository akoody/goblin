import { db } from "../config/db.js";

export const featureKeys = Object.freeze(["p2p", "processing", "nft", "market", "guarantor"]);
const defaults = Object.freeze(Object.fromEntries(featureKeys.map((key) => [key, true])));
let cache = { expiresAt: 0, value: defaults };

export const getPlatformFeatures = async () => {
  if (cache.expiresAt > Date.now()) return cache.value;

  const [rows] = await db.query(
    "SELECT feature_key, enabled FROM platform_features"
  );
  const value = { ...defaults };
  for (const row of rows) if(featureKeys.includes(row.feature_key))value[row.feature_key] = Number(row.enabled) === 1;
  cache = { value, expiresAt: Date.now() + 5_000 };
  return value;
};

export const updatePlatformFeature = async (feature, enabled) => {
  if (!featureKeys.includes(feature)) throw new Error("Unknown platform feature");
  await db.execute(
    `INSERT INTO platform_features (feature_key, enabled)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE enabled = VALUES(enabled)`,
    [feature, enabled ? 1 : 0]
  );
  cache.expiresAt = 0;
  return getPlatformFeatures();
};

export const requirePlatformFeature = (feature) => async (req, res, next) => {
  try {
    // Administrative deal review remains available during a public P2P pause.
    // The downstream route still performs its own administrator authorization.
    if (feature === "p2p" && req.path.startsWith("/admin/")) return next();
    const features = await getPlatformFeatures();
    if (features[feature]) return next();
    return res.status(503).json({
      code: "FEATURE_MAINTENANCE",
      message: "Раздел временно недоступен: проводится обновление.",
    });
  } catch (error) {
    console.error(`Feature availability check failed for ${feature}:`, error);
    return res.status(503).json({ message: "Раздел временно недоступен." });
  }
};

export async function assertPlatformFeature(feature, administrator=false) {
  if(administrator)return;
  const features=await getPlatformFeatures();
  if(!features[feature])throw Object.assign(new Error('Раздел временно недоступен: проводится обновление.'),{status:503,code:'FEATURE_MAINTENANCE'});
}

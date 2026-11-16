// Админка: Включение и выключение разделов платформы. Маршруты подключает routes/admin.routes.js после проверки прав.
import { featureKeys, getPlatformFeatures, updatePlatformFeature } from "../../services/platform-features.service.js";

export default function register(router) {
router.get("/features", async (req, res) => {
  try {
    res.json(await getPlatformFeatures());
  } catch (error) {
    console.error("GET /admin/features error:", error);
    res.status(500).json({ message: "Failed to load platform features" });
  }
});
router.patch("/features/:feature", async (req, res) => {
  try {
    const feature = String(req.params.feature || "").trim();
    if (!featureKeys.includes(feature) || typeof req.body?.enabled !== "boolean") {
      return res.status(400).json({ message: "Invalid feature settings" });
    }
    res.json(await updatePlatformFeature(feature, req.body.enabled));
  } catch (error) {
    if(error.status===409)return res.status(409).json({message:error.message});
    console.error("PATCH /admin/features error:", error);
    res.status(500).json({ message: "Failed to update platform feature" });
  }
});
}

// Админка: отчёт по деньгам платформы. Каждая комиссия в казне и каждое списание из неё с источником, итоги и сверка
// с остатком казны; тот же отбор целиком в CSV. Только для админа: в правах хелперов этих маршрутов нет.
import { incomeReport, incomeReportCsv } from "../../services/platform-income-report.service.js";

const failed = (res, error) => {
  if (!error.status) console.error("Income report:", error.message);
  res.status(error.status || 500).json({ message: error.status ? error.message : "Не удалось построить отчёт" });
};

export default function register(router) {
  router.get("/income-report", async (req, res) => {
    try {
      res.set("Cache-Control", "no-store").json(await incomeReport(req.query));
    } catch (error) {
      failed(res, error);
    }
  });
  router.get("/income-report.csv", async (req, res) => {
    try {
      const csv = await incomeReportCsv(req.query);
      const day = new Date().toISOString().slice(0, 10);
      res
        .set("Cache-Control", "no-store")
        .set("Content-Type", "text/csv; charset=utf-8")
        .set("Content-Disposition", `attachment; filename="goblin-income-${day}.csv"`)
        .send(csv);
    } catch (error) {
      failed(res, error);
    }
  });
}

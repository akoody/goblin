import "dotenv/config";
import {server} from "./src/app.js";
import { startRiskEngine } from "./src/services/risk-engine.service.js";
import { runMigrations } from "./scripts/migrate-db.js";

const PORT = process.env.PORT || 3000;

await runMigrations();

server.listen(PORT, () => {
    console.log("Server running on port", PORT);
    startRiskEngine();
});

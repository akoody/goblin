import "dotenv/config";
import {startTreasuryPayouts} from './src/services/treasury-payout.service.js';
import {startReferralAccrual} from './src/services/referral-accrual.service.js';
import {startNativeChainEngine} from './src/services/native-chain-scanner.js';
import {startCollectionEngine} from './src/services/collection-engine.service.js';
import {startTronSwaps} from './src/services/tron-swap.service.js';
import {startSolanaEngine} from './src/services/solana-deposits.service.js';
import {server} from "./src/app.js";
import { startRiskEngine } from "./src/services/risk-engine.service.js";
import { runMigrations } from "./scripts/migrate-db.js";
import { startBlockchainEngine } from "./src/services/blockchain-processing.service.js";
import { startSafioScreening } from './src/services/safio-screening.service.js';
import { startNewsNotifications } from './src/services/push-broadcast.service.js';

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "127.0.0.1";

await runMigrations();

server.listen(PORT, HOST, () => {
    console.log("Server running on port", PORT);
    startRiskEngine();
    startReferralAccrual();
    startBlockchainEngine();
    startSafioScreening();
    startSolanaEngine();
    startTronSwaps();
    startCollectionEngine();
    startTreasuryPayouts();
    startNativeChainEngine();
    startNewsNotifications();
});

import express from "express";
import {requireAccountFeature} from '../middleware/account-feature.js';
import { auth } from "../middleware/auth.js";
import { cancelOrder, closeFuturesPosition, getExchangeState, placeOrder } from "../services/exchange.service.js";
import { getMarketSnapshot } from "../services/market-data.service.js";

const router = express.Router();

const handleError = (res, error) => {
  console.error("Exchange error:", error);
  res.status(error.status || 500).json({ message: error.status ? error.message : "Exchange operation failed" });
};

router.get("/market/:symbol", async (req, res) => {
  try {
    res.json(await getMarketSnapshot(String(req.params.symbol).toUpperCase().replace("_", "-")));
  } catch (error) {
    handleError(res, error);
  }
});

router.use(auth);
router.use(requireAccountFeature('trading'));

router.get("/state", async (req, res) => {
  try {
    res.json(await getExchangeState(req.user.userId, req.query.market, req.query.symbol));
  } catch (error) {
    handleError(res, error);
  }
});

router.post("/orders", async (req, res) => {
  try {
    res.status(201).json(await placeOrder(req.user.userId, req.body));
  } catch (error) {
    handleError(res, error);
  }
});

router.delete("/orders/:id", async (req, res) => {
  try {
    res.json(await cancelOrder(req.user.userId, req.params.id));
  } catch (error) {
    handleError(res, error);
  }
});

router.post("/positions/:id/close", async (req, res) => {
  try {
    res.json(await closeFuturesPosition(req.user.userId, req.params.id));
  } catch (error) {
    handleError(res, error);
  }
});

export default router;

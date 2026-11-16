import express from "express";
import bybitTestnetRoutes from "./bybit-testnet.routes.js";
import {requireAccountFeature} from '../middleware/account-feature.js';
import { auth } from "../middleware/auth.js";
import { cancelOrder, closeFuturesPosition, getExchangeBook, getExchangeState, placeOrder } from "../services/exchange.service.js";
import { getMarketSnapshot } from "../services/market-data.service.js";
import {listPumpPairs,pumpPairPattern,pumpSpotSnapshot} from '../services/pump-spot.service.js';

const router = express.Router();

const handleError = (res, error) => {
  if(!error.status)console.error("Exchange error:", error);
  res.status(error.status || 500).json({ message: error.status ? error.message : "Exchange operation failed",code:error.code==='FUTURES_DISABLED'?error.code:undefined });
};

router.get("/market/:symbol", async (req, res) => {
  try {
    const symbol=String(req.params.symbol).toUpperCase().replace("_", "-");
    res.json(pumpPairPattern.test(symbol)&&String(req.query.market??'SPOT').toUpperCase()==='SPOT'
      ?await pumpSpotSnapshot(symbol):await getMarketSnapshot(symbol,req.query.market));
  } catch (error) {
    handleError(res, error);
  }
});

router.get('/spot-pairs',async(_req,res)=>{
  try{res.set('Cache-Control','no-store').json(await listPumpPairs());}
  catch(error){handleError(res,error);}
});

router.get("/book/:symbol", async (req, res) => {
  try {
    res.json(await getExchangeBook(req.query.market, req.params.symbol));
  } catch (error) {
    handleError(res, error);
  }
});

router.use(auth);
router.use(requireAccountFeature('trading'));
router.use('/bybit',bybitTestnetRoutes);

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

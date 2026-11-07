import express from "express";
import {requireAccountFeature} from '../middleware/account-feature.js';
import { buyGift, getGiftMarketHistory, getInventory, getMarketplace, listGift, unlistGift } from "../services/nft.service.js";

const router = express.Router();
router.use(requireAccountFeature('nft'));

const handleError = (res, error) => {
  console.error("NFT marketplace error:", error);
  res.status(error.status || 500).json({ message: error.status ? error.message : "NFT marketplace operation failed" });
};

router.get("/marketplace", async (req, res) => {
  try {
    res.json(await getMarketplace(req.query.search));
  } catch (error) {
    handleError(res, error);
  }
});

router.get("/inventory", async (req, res) => {
  try {
    res.json(await getInventory(req.user.userId));
  } catch (error) {
    handleError(res, error);
  }
});

router.get("/gifts/:giftId/history", async (req, res) => {
  try {
    res.json(await getGiftMarketHistory(req.params.giftId));
  } catch (error) {
    handleError(res, error);
  }
});

router.post("/marketplace/:itemId/buy", async (req, res) => {
  try {
    res.status(201).json(await buyGift(req.user.userId, req.params.itemId));
  } catch (error) {
    handleError(res, error);
  }
});

router.post("/inventory/:itemId/list", async (req, res) => {
  try {
    res.json(await listGift(req.user.userId, req.params.itemId, req.body?.price));
  } catch (error) {
    handleError(res, error);
  }
});

router.delete("/inventory/:itemId/listing", async (req, res) => {
  try {
    res.json(await unlistGift(req.user.userId, req.params.itemId));
  } catch (error) {
    handleError(res, error);
  }
});

export default router;

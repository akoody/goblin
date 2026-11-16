import {Router} from 'express';
import {createRateLimit} from '../middleware/rate-limit.js';
import {assertPlatformFeature} from '../services/platform-features.service.js';
import {bybitState,cancelBybitOrder,closeBybitPosition,connectBybit,disconnectBybit,placeBybitOrder} from '../services/bybit-testnet.service.js';

const router = Router();
const limit = createRateLimit({windowMs:60_000,max:12,message:'Слишком много запросов к Bybit. Повторите позже.'});
const handle = operation => async (req,res) => {
  res.set('Cache-Control','no-store');
  try {
    res.json(await operation(req.user.userId,req) ?? {success:true});
  } catch(error) {
    if (!error.status) console.error('Bybit Testnet operation failed',error.name);
    res.status(error.status ?? 500).json({
      message:error.status ? error.message : 'Не удалось выполнить запрос к Bybit.',
      ...(error.code === 'BYBIT_UNKNOWN' ? {code:error.code} : {}),
    });
  }
};

router.get('/state',handle((userId,req)=>bybitState(userId,req.query.symbol)));
router.post('/connection',limit,handle((userId,req)=>connectBybit(userId,req.body)));
router.delete('/connection',limit,handle((userId,req)=>disconnectBybit(userId,req.query.connectionId)));
router.post('/orders',limit,handle(async (userId,req)=>{
  await assertPlatformFeature('futures');
  return placeBybitOrder(userId,req.body);
}));
router.post('/orders/cancel',limit,handle((userId,req)=>cancelBybitOrder(userId,req.body)));
router.post('/positions/close',limit,handle((userId,req)=>closeBybitPosition(userId,req.body)));
export default router;

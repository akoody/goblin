import {Router} from 'express';
import {verifyAccessToken} from '../../config/jwt.js';
import {createRateLimit} from '../../middleware/rate-limit.js';
import {createLoginSession} from '../../services/auth.service.js';
import {authenticatorStatus,disableAuthenticator,enableAuthenticator,startAuthenticatorSetup} from '../../services/authenticator.service.js';
import {setMarketCookie} from '../../services/market-session.service.js';

export function authenticatorRoutes(onSessionChange){
  const router=Router();
  const limit=createRateLimit({windowMs:5*60_000,max:15,message:'Слишком много попыток. Попробуйте позже.'});
  const handle=operation=>async(req,res)=>{
    res.set('Cache-Control','no-store');
    try{
      const result=await operation(req.user,req.body??{});
      if(!result.user)return res.json(result);
      const token=createLoginSession(result.user);
      setMarketCookie(res,token,verifyAccessToken(token).exp,req.secure);
      onSessionChange(result.user.id);
      return res.json({access_token:token,recoveryCodes:result.recoveryCodes});
    }catch(error){
      if(error.status)return res.status(error.status).json({code:error.code,message:error.message});
      console.error('Authenticator request failed',error.code||error.name);
      return res.status(503).json({message:'Настройки Authenticator временно недоступны.'});
    }
  };
  router.get('/',handle(authenticatorStatus));
  router.post('/setup',limit,handle((session,body)=>startAuthenticatorSetup(session,body.password)));
  router.post('/enable',limit,handle((session,body)=>enableAuthenticator(session,body.code)));
  router.post('/disable',limit,handle((session,body)=>disableAuthenticator(session,body.password,body.code)));
  return router;
}

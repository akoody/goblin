import {db} from '../config/db.js';
const columns={nft:'nft_enabled',guarantor:'guarantor_enabled',trading:'trading_enabled'};
export async function assertAccountFeature(userId,feature){
  const column=columns[feature];
  if(!column)throw new Error('Unknown account feature');
  const [[row]]=await db.execute(`SELECT ${column} AS enabled FROM users WHERE id=?`,[userId]);
  if(!row||Number(row.enabled)!==1)throw Object.assign(new Error('Администратор отключил доступ к этому разделу для вашего аккаунта'),{status:403,code:'ACCOUNT_FEATURE_DISABLED'});
}
export const requireAccountFeature=feature=>async(req,res,next)=>{
  try{await assertAccountFeature(req.user.userId,feature);next();}
  catch(e){res.status(e.status||500).json({message:e.status?e.message:'Не удалось проверить доступ',code:e.code});}
};

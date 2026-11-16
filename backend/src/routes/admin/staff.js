// Админка: Сотрудники: хелперы и их права. Маршруты подключает routes/admin.routes.js после проверки прав.
import { listHelpers, saveHelper } from "../../services/staff-access.service.js";

export default function register(router) {
router.get('/helpers',async(_req,res)=>{try{res.set('Cache-Control','no-store').json(await listHelpers());}catch{res.status(500).json({message:'Не удалось загрузить хелперов'});}});
router.post('/helpers',async(req,res)=>{try{res.json(await saveHelper(req.user.userId,String(req.body?.identifier||''),req.body));}catch(e){res.status(e.status||500).json({message:e.status?e.message:'Не удалось сохранить хелпера'});}});
}

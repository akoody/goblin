import {db} from '../config/db.js';
export async function chatProfile(id){
 const [[u]]=await db.execute('SELECT id,username,email FROM users WHERE id=?',[id]);
 if(!u)return {id,username:'Пользователь',role:'user'};
 const admins=String(process.env.ADMIN_EMAILS||process.env.VITE_ADMIN_EMAILS||'').toLowerCase().split(/[,;\n]/).map(v=>v.trim());
 const [[h]]=await db.execute('SELECT enabled FROM staff_helpers WHERE user_id=?',[id]);
 return {id:u.id,username:u.username,role:admins.includes(String(u.email).toLowerCase())?'admin':Number(h?.enabled)===1?'helper':'user'};
}

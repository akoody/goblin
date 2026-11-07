import Decimal from 'decimal.js';
import {atomicSol} from './solana-client.js';
export const solUnits=value=>new Decimal(String(value)).div(1e9).toFixed(9);
export function launchInput(body,policy){
 const name=String(body.name||'').trim(),symbol=String(body.symbol||'').trim();
 if(!name||Buffer.byteLength(name)>32||!symbol||!/^[A-Za-z0-9]{1,13}$/.test(symbol))throw new Error('Название: до 32 байт; тикер: 1–13 латинских букв или цифр');
 const description=String(body.description||'').trim();if(description.length>2000)throw new Error('Описание: максимум 2000 символов');
 const image=String(body.image||'');
 if(image.length>1400000||!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(image))throw new Error('Загрузите PNG или JPEG до 1 МБ');
 const bytes=Buffer.from(image.split(',')[1],'base64');
 if(bytes.length>1048576||!(image.startsWith('data:image/png;')?bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')):bytes[0]===255&&bytes[1]===216&&bytes[2]===255))throw new Error('Некорректный файл изображения');
 const links={};for(const key of ['website','telegram','twitter']){const value=String(body[key]||'').trim();if(!value)continue;const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||value.length>300)throw new Error('Ссылки должны начинаться с https://');links[key]=u.href;}
 const buy=atomicSol(body.buySol);if(new Decimal(body.buySol).lt(policy.minimum_buy_sol))throw new Error(`Первая покупка: минимум ${policy.minimum_buy_sol} SOL`);
 const fee=atomicSol(policy.service_fee_sol),budget=atomicSol(policy.network_budget_sol);
 return {name,symbol,description,image,links,buy,fee,budget,reserve:(BigInt(buy)+BigInt(fee)+BigInt(budget)).toString()};
}

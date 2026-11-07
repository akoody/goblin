import {randomUUID} from 'node:crypto';
import {mkdir,writeFile,unlink} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {db} from '../config/db.js';
export const mediaDirectory=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../uploads/news');
export function detectNewsMedia(buffer){
 if(!Buffer.isBuffer(buffer)||buffer.length<12)throw Object.assign(new Error('Файл пустой или повреждён'),{status:400});
 if(buffer.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))return 'image/png';
 if(buffer[0]===255&&buffer[1]===216&&buffer[2]===255)return 'image/jpeg';
 if(['GIF87a','GIF89a'].includes(buffer.toString('ascii',0,6))&&buffer.readUInt16LE(6)>0&&buffer.readUInt16LE(8)>0)return 'image/gif';
 if(buffer.toString('ascii',0,4)==='RIFF'&&buffer.toString('ascii',8,12)==='WEBP')return 'image/webp';
 if(buffer.toString('ascii',0,3)==='ID3'||buffer[0]===255&&(buffer[1]&0xe0)===0xe0)return 'audio/mpeg';
 if(buffer.toString('ascii',0,4)==='RIFF'&&buffer.toString('ascii',8,12)==='WAVE')return 'audio/wav';
 if(buffer.toString('ascii',0,4)==='OggS')return 'audio/ogg';
 if(buffer.toString('ascii',4,8)==='ftyp')return buffer.toString('ascii',8,12)==='M4A '?'audio/mp4':'video/mp4';
 if(buffer.subarray(0,4).equals(Buffer.from('1a45dfa3','hex')))return 'video/webm';
 throw Object.assign(new Error('Поддерживаются JPG, PNG, WebP, GIF, MP3, WAV, OGG, M4A, MP4 и WebM'),{status:400});
}
export const mediaView=row=>({id:row.id,name:row.filename,mime:row.mime,url:`/api/content/media/${row.id}`,size:Number(row.size_bytes)});
export async function uploadNewsMedia(userId,buffer,name){
 const mime=detectNewsMedia(buffer),max=(mime.startsWith('image/')?5:20)*1024*1024;
 if(buffer.length>max)throw Object.assign(new Error(`Размер файла — не более ${max/1024/1024} МБ`),{status:413});
 const id=randomUUID(),filename=String(name||'Медиафайл').replace(/[\x00-\x1f/\\]/g,'_').slice(0,200);
 await mkdir(mediaDirectory,{recursive:true,mode:0o700});await writeFile(path.join(mediaDirectory,id),buffer,{flag:'wx',mode:0o600});
 try{await db.execute('INSERT INTO site_media(id,mime,filename,size_bytes,uploaded_by) VALUES(?,?,?,?,?)',[id,mime,filename,buffer.length,userId]);}catch(e){await unlink(path.join(mediaDirectory,id));throw e;}
 return mediaView({id,mime,filename,size_bytes:buffer.length});
}
export async function withNewsMedia(rows){
 if(!rows.length)return rows;
 const [media]=await db.query(`SELECT m.*,a.article_id FROM site_article_media a JOIN site_media m ON m.id=a.media_id WHERE a.article_id IN (${rows.map(()=>'?').join(',')}) ORDER BY a.position`,rows.map(r=>r.id));
 return rows.map(r=>({...r,media:media.filter(m=>String(m.article_id)===String(r.id)).map(mediaView)}));
}

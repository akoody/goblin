import {useEffect,useState} from 'react';
import api from '../../api';
import styles from './Content.module.scss';
function MediaItem({file,admin}){
 const [preview,setPreview]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview);},[preview]);
 async function load(){setLoading(true);setError('');try{const r=await api.get(`/api/content/admin/media/${file.id}`,{responseType:'blob'});setPreview(URL.createObjectURL(r.data));}catch{setError('Не удалось открыть файл');}finally{setLoading(false);}}
 const src=admin?preview:new URL(file.url,api.defaults.baseURL).href;
 return <figure className={styles.media}>{src?(file.mime.startsWith('image/')?<a href={src} target="_blank" rel="noreferrer"><img src={src} alt={admin?file.name:'Изображение к новости'} loading="lazy"/></a>:file.mime.startsWith('audio/')?<audio aria-label="Аудио к новости" controls preload="metadata" src={src}>Аудио недоступно в вашем браузере.</audio>:<video aria-label="Видео к новости" controls playsInline preload="metadata" src={src}>Видео недоступно в вашем браузере.</video>):<button type="button" disabled={loading} onClick={load}>{loading?'Загрузка…':'Предпросмотр'}</button>}{admin&&<figcaption>{file.name}</figcaption>}{error&&<p role="alert">{error}</p>}</figure>;
}
export function NewsMedia({files=[],admin=false}){return files.map(file=><MediaItem key={file.id} file={file} admin={admin}/>);}
export function NewsMediaEditor({files=[],onChange,onBusy,disabled}){
 const [error,setError]=useState('');
 async function upload(e){
  const selected=Array.from(e.target.files||[]);e.target.value='';setError('');
  if(selected.length+files.length>10){setError('Максимум 10 файлов на новость');return;}
  onBusy(true);let next=[...files];
  try{for(const file of selected){const max=file.type.startsWith('image/')?5:20;if(file.size>max*1024*1024)throw new Error(`${file.name}: максимум ${max} МБ`);const r=await api.post('/api/content/admin/media',file,{headers:{'Content-Type':'application/octet-stream'},params:{name:file.name}});next=[...next,r.data];onChange(next);}}
  catch(e){setError(e.response?.data?.message||e.message||'Не удалось загрузить файл');}finally{onBusy(false);}
 }
 return <fieldset className={styles.mediaEditor}><legend>Фото, GIF, аудио и видео</legend><p>Изображения: JPG, PNG, WebP, GIF — до 5 МБ. Аудио: MP3, WAV, OGG, M4A; видео: MP4, WebM — до 20 МБ. Не более 10 файлов.</p><label>Добавить медиафайлы<input type="file" multiple disabled={disabled} accept="image/png,image/jpeg,image/webp,image/gif,audio/mpeg,audio/wav,audio/ogg,audio/mp4,video/mp4,video/webm,.gif,.mp3,.wav,.ogg,.m4a" onChange={upload}/></label>{error&&<p role="alert">{error}</p>}{files.map(file=><div key={file.id}><NewsMedia files={[file]} admin/><button type="button" disabled={disabled} onClick={()=>onChange(files.filter(f=>f.id!==file.id))}>Убрать файл</button></div>)}</fieldset>;
}

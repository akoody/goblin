import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdir,unlink,writeFile} from 'node:fs/promises';

const directory=fileURLToPath(new URL('../../uploads/escrow/',import.meta.url));
export const escrowAttachmentPath=id=>path.join(directory,id);
export const attachmentName=value=>String(value||'Вложение').replace(/[\x00-\x1f\x7f/\\\u202a-\u202e\u2066-\u2069]/g,'_').trim().slice(0,180)||'Вложение';

export async function storeEscrowAttachment(id,buffer){
  await mkdir(directory,{mode:0o700,recursive:true});
  await writeFile(escrowAttachmentPath(id),buffer,{mode:0o600,flag:'wx'});
}

export async function removeEscrowAttachment(id){
  await unlink(escrowAttachmentPath(id)).catch(error=>{
    if(error.code!=='ENOENT')console.error('Failed to remove escrow attachment',error.code);
  });
}

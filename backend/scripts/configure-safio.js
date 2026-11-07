import 'dotenv/config';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { createSafioClient } from '../src/services/safio-client.js';

// Supply the key through a hidden terminal prompt or a secret manager.
const key = process.env.SAFIO_NEW_API_KEY?.trim();
if (!/^sk_safio_[A-Za-z0-9_-]+$/.test(key || '')) throw new Error('A Safio key is required through SAFIO_NEW_API_KEY');
const capabilities = await createSafioClient(key).capabilities();
if (!capabilities.products?.some(p=>p.product==='screen' && p.allowed) ||
    !capabilities.networks?.some(n=>n.network==='tron' && n.assets?.includes('USDT') && n.address_products?.includes('screen'))) {
  throw new Error('This key does not allow TRON/USDT address screening');
}
const filename = new URL('../.env', import.meta.url);
const original = await readFile(filename,'utf8');
const startAt = process.env.SAFIO_START_AT || new Date().toISOString().slice(0,19).replace('T',' ');
const clean = original.replace(/^(?:SAFIO_API_KEY|SAFIO_START_AT)=.*\r?\n?/gm,'');
const temporary = new URL('../.env.safio.tmp', import.meta.url);
await writeFile(temporary,`${clean.trimEnd()}\nSAFIO_API_KEY=${key}\nSAFIO_START_AT="${startAt}"\n`,{mode:0o600,flag:'wx'});
await rename(temporary,filename);
console.log('Safio capabilities verified; credentials saved; screening starts at',startAt,'UTC');

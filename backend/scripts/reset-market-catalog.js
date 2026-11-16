import 'dotenv/config';
import {db} from '../src/config/db.js';
import {clearExistingCatalog} from '../src/services/market-catalog-reset.service.js';
if(process.argv[2]!=='--confirm-clear-existing-categories')throw new Error('Explicit category reset confirmation required');
try {
  console.log(JSON.stringify(await clearExistingCatalog('2026-11-09-owner-catalog-clear')));
}finally{await db.end();}

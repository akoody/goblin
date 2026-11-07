import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/config/db.js';
import { escrowAdminFilter, escrowAdminList } from '../src/services/escrow-admin.service.js';
test('Escrow administrator filters are bound, escaped and limited to guarantor deals', () => {
  const filter=escrowAdminFilter({q:'%_!',status:'DISPUTED',page:'2'});
  assert(filter.where.includes("d.kind='ESCROW'"));assert(filter.where.includes('d.status=?'));
  assert.equal(filter.params[0],'DISPUTED');assert.equal(filter.params[1],'%!%!_!!%');assert.equal(filter.page,2);
  assert(escrowAdminFilter({status:'active'}).where.includes('d.status IN'));
  assert(escrowAdminFilter({status:'waiting'}).where.includes("'WAITING','READY'"));
  assert(escrowAdminFilter({status:'active'}).where.includes("'FUNDED','DELIVERED','DISPUTED'"));
  assert(escrowAdminFilter({status:'closed'}).where.includes("'COMPLETED','REFUNDED','CANCELLED'"));
  assert(escrowAdminFilter({status:'unread'},42).params.includes(42));
  for(const query of [{page:0},{page:1.5},{page:'NaN'},{status:'INVALID'},{status:{}},{q:[]}])assert.throws(()=>escrowAdminFilter(query));
});
test('Escrow read-only report paginates and releases database connection',async()=>{
  const original=db.getConnection,queries=[];let committed=false,released=false;
  db.getConnection=async()=>({beginTransaction:async()=>{},commit:async()=>{committed=true;},rollback:async()=>{},release(){released=true;},query:async(sql,args)=>{
    queries.push({sql,args});return sql.startsWith('SELECT COUNT(*) AS total')?[[{total:26}]]:[[{id:'deal-1',kind:'ESCROW',status:'DISPUTED',amount:'10.123456',unread_count:3}]];
  }});
  try{const data=await escrowAdminList({page:2,status:'DISPUTED'},99);assert.equal(data.total,26);assert.equal(data.pageSize,25);assert.equal(data.rows[0].amount,'10.123456');assert.equal(data.rows[0].unread_count,3);assert(queries.every(({sql})=>sql.startsWith('SELECT')));assert.equal(queries[0].args[0],99);assert.equal(queries[1].args.at(-1),25);assert(committed&&released);}
  finally{db.getConnection=original;await db.end();}
});

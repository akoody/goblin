import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {db} from '../src/config/db.js';
import supportRoutes from '../src/routes/support.routes.js';
import messageRoutes from '../src/routes/message.routes.js';

test('Helpers reply as operators, cannot close tickets, and lose chat access immediately on revocation',async()=>{
  const original=db.execute;let enabled=true,writes=0;
  db.execute=async(sql,args)=>{
    if(sql.includes('SELECT id,email,status FROM users'))return [[{id:2,email:'helper-test@example.invalid',status:'active'}]];
    if(sql.includes('FROM staff_helpers'))return [enabled?[{permission:'chat'}]:[]];
    if(sql.includes('SELECT user_id FROM support_tickets'))return [[{user_id:99}]];
    if(sql.startsWith('INSERT INTO support_messages')){assert.equal(args[4],'operator');writes++;return [{affectedRows:1}];}
    if(sql.includes('SELECT sm.*'))return [[{id:'message-id',sender_id:2,username:'helper',email:'helper-test@example.invalid',staff_role:'operator',text:'Ответ клиенту'}]];
    if(sql.includes('SELECT id FROM deals'))return [[]];
    return [{affectedRows:1}];
  };
  const app=express();app.use(express.json());app.use((req,_res,next)=>{req.user={userId:2};next();});app.use('/support',supportRoutes);app.use('/message',messageRoutes);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const base=`http://127.0.0.1:${server.address().port}`;
  const request=(path,body,method='POST')=>fetch(base+path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  try{
    const response=await request('/support/tickets/1/messages',{text:'Ответ клиенту'});
    assert.equal(response.status,201);assert.equal((await response.json()).sender.role,'operator');
    assert.equal((await request('/support/tickets/1',{status:'closed'},'PATCH')).status,403);
    assert.equal((await request('/support/tickets/1/reopen',{})).status,403);
    assert.equal((await request('/message',{dealId:1,text:'P2P without permission'})).status,403);
    enabled=false;
    assert.equal((await request('/support/tickets/1/messages',{text:'No permission now'})).status,403);
    assert.equal(writes,1);
  }finally{await new Promise(resolve=>server.close(resolve));db.execute=original;await db.end();}
});

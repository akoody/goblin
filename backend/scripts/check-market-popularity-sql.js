// Requires an isolated, migrated QA database, never the production schema.
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import {db} from '../src/config/db.js';
import {catalogVisitorHash,recordCatalogVisit,attachCatalogPopularity} from '../src/services/market-popularity.service.js';
const database=process.env.REFERRAL_QA_DATABASE;
if(!/^qa_referral_[a-z0-9_]+$/.test(database||'')||database===process.env.DB_NAME)throw Error('An isolated QA schema is required');
const qa=mysql.createPool({socketPath:'/var/run/mysqld/mysqld.sock',user:'root',database,connectionLimit:5});
const original={execute:db.execute,query:db.query,getConnection:db.getConnection};
db.execute=qa.execute.bind(qa);db.query=qa.query.bind(qa);db.getConnection=qa.getConnection.bind(qa);
try {
  const [[count]]=await qa.query('SELECT COUNT(*) n FROM market_catalog_views');assert.equal(Number(count.n),0);
  await qa.execute('INSERT INTO market_application_state(id,payload) VALUES(1,?)',[JSON.stringify({catalogItems:[{slug:'qa-category',sections:[{name:'Аккаунты'},{name:'Услуги'}]}]})]);
  const visitorHash=catalogVisitorHash({userId:1},'qa-secret');
  const results=await Promise.all([recordCatalogVisit({slug:'qa-category',area:'accounts',visitorHash}),recordCatalogVisit({slug:'qa-category',area:'accounts',visitorHash})]);
  assert.equal(results.filter(result=>result.counted).length,1);
  assert.equal((await recordCatalogVisit({slug:'qa-category',area:'accounts',visitorHash})).counted,false);
  await recordCatalogVisit({slug:'qa-category',area:'accounts',visitorHash:catalogVisitorHash({userId:2},'qa-secret')});
  await recordCatalogVisit({slug:'qa-category',area:'services',visitorHash});
  const [item]=await attachCatalogPopularity(qa,[{slug:'qa-category'}]);assert.deepEqual(item.visitCounts,{accounts:2,services:1});
  await assert.rejects(()=>recordCatalogVisit({slug:'not-existing',area:'accounts',visitorHash}),{status:404});
  await qa.execute('UPDATE market_catalog_visit_dedup SET visit_day=DATE_SUB(UTC_DATE(),INTERVAL 5 DAY)');
  await recordCatalogVisit({slug:'qa-category',area:'accounts',visitorHash});
  const [[retained]]=await qa.query('SELECT COUNT(*) n FROM market_catalog_visit_dedup');assert.equal(Number(retained.n),1);
  assert.deepEqual((await attachCatalogPopularity(qa,[{slug:'qa-category'}]))[0].visitCounts,{accounts:3,services:1});
  console.log(JSON.stringify({isolatedSql:true,concurrentVisitCountedOnce:true,refreshDedup:true,separateAreas:true,unknownCategoryRejected:true,hashRetention:true,countersPreserved:true}));
}finally{Object.assign(db,original);await qa.end();await db.end();}

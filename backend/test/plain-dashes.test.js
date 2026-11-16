import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {plainDashes,plainArticle} from '../src/services/plain-dashes.js';

test('project content uses ASCII hyphens without changing IDs, links or other data',()=>{
 assert.equal(plainDashes('Goblin \u2014 кошелёк, 1\u20133'), 'Goblin - кошелёк, 1-3');
 assert.equal(plainDashes(null),null);
 assert.deepEqual(plainArticle({id:7,title:'A\u2014B',body:'C\u2013D',url:'https://example.com/a'}),{id:7,title:'A-B',body:'C-D',url:'https://example.com/a'});
});

test('interface and preview source copy contains no long dash characters',()=>{
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
 const invalid=[];
 function scan(file){
  if(!fs.existsSync(file))return;
  if(fs.statSync(file).isDirectory()){for(const name of fs.readdirSync(file))scan(path.join(file,name));return;}
  if(/\.(?:js|jsx|mjs|ts|tsx|html|css|scss|webmanifest)$/.test(file)&&/[\u2013\u2014]/.test(fs.readFileSync(file,'utf8')))invalid.push(path.relative(root,file));
 }
 for(const item of ['index.html','src','public','backend/src'])scan(path.join(root,item));
 assert.deepEqual(invalid,[]);
});

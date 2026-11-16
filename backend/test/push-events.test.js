import test from 'node:test';
import assert from 'node:assert/strict';
import {beginPostCommit,afterCommit,finishPostCommit} from '../src/services/post-commit.js';
import {eventContent,pushTexts,validateBroadcast} from '../src/services/push-events.js';
import {pushDestination} from '../../src/utils/pushNavigation.mjs';

test('Notifications run only after commit, never after rollback or twice on pooled connection',()=>{
 const connection={},events=[];
 beginPostCommit(connection);afterCommit(connection,()=>events.push('credited'));
 assert.deepEqual(events,[]);finishPostCommit(connection,false);assert.deepEqual(events,[]);
 beginPostCommit(connection);afterCommit(connection,()=>events.push('credited'));
 finishPostCommit(connection,true);finishPostCommit(connection,true);assert.deepEqual(events,['credited']);
 assert.throws(()=>afterCommit(connection,()=>{}));
});
test('All automatic event texts are predefined and links remain recipient scoped',()=>{
 for(const type of Object.keys(pushTexts))assert(eventContent(type).body);
 assert.throws(()=>eventContent('user-entered-text'));
 assert.equal(pushDestination({recipientId:1,path:'/me?section=transactions'},1),'/me?section=transactions');
 assert.equal(pushDestination({recipientId:2,path:'/me?section=transactions'},1),null);
 assert.equal(pushDestination({recipientId:1,path:'/me?secret=1'},1),null);
});
test('Admin broadcasts validate length, request id and internal destination',()=>{
 const value={title:'Новость',body:'Текст',path:'/news',requestKey:'6ba7b810-9dad-4d80-80b4-00c04fd430c8'};
 assert.equal(validateBroadcast(value).eventType,'broadcast');
 for(const change of [{title:''},{body:'x'.repeat(501)},{path:'https://evil.test'},{requestKey:'bad'}])assert.throws(()=>validateBroadcast({...value,...change}));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { loginIpSearch } from '../src/services/login-ip-search.js';
test('Login search covers account, IP and device across all rows',()=>{
  const s=loginIpSearch('84.125');assert(s.where.includes('u.email'));assert(s.where.includes('l.previous_ip'));assert(s.where.includes('l.device_model'));assert.equal(s.params.length,7);assert.equal(s.params[3],'%84.125%');
});
test('Search escapes literal SQL wildcard characters and normalizes account ID',()=>{
  assert.equal(loginIpSearch(' %_! ').params[0],'%!%!_!!%');assert.equal(loginIpSearch('#22').params[2],'%22%');assert.equal(loginIpSearch(' ').where,'');assert.throws(()=>loginIpSearch(['x']),/Некорректный/);assert.equal(loginIpSearch('x'.repeat(200)).term.length,160);
});

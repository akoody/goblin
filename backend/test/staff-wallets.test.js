import test from 'node:test';
import assert from 'node:assert/strict';
import {db} from '../src/config/db.js';
import {staffWalletBalances} from '../src/services/staff-wallets.service.js';
import {completeWalletInventory} from '../src/services/wallet-inventory.js';

test('Wallet display includes missing SOL without creating a custodial account', () => {
  const rows = [{currency:'USDT', total:'10.6', available:'8.6', locked:'2'}];
  const wallets = completeWalletInventory(rows);
  assert.equal(wallets.length, 5);
  assert.deepEqual(wallets.find(w => w.currency === 'SOL'), {currency:'SOL', total:'0', available:'0', locked:'0'});
  assert.equal(rows.length, 1);
  assert.equal(wallets.find(w => w.currency === 'USDT').available, '8.6');
});

test('Staff reads real SOL and future assets without replacing their balance or reserves', async () => {
  const original = db.execute;
  db.execute = async (sql, args) => {
    assert.deepEqual(args, [42]);
    assert(sql.startsWith('SELECT'));
    assert(!sql.includes('private_key'));
    if (sql.includes('FROM users')) return [[{id:42, username:'test'}]];
    if (sql.includes('FROM wallets')) return [[
      {currency:'SOL', total:'1.234567891', available:'1.134567891', locked:'0.1'},
      {currency:'NEW', total:'2', available:'2', locked:'0'},
    ]];
    return [[{mint:'mint', decimals:9, amount_atomic:'1'}]];
  };
  try {
    const data = await staffWalletBalances(42);
    assert.equal(data.wallets.length, 6);
    assert.equal(data.wallets.find(w => w.currency === 'SOL').available, '1.134567891');
    assert.equal(data.wallets.find(w => w.currency === 'NEW').total, '2');
    assert.equal(data.tokens[0].amount_atomic, '1');
    await assert.rejects(staffWalletBalances('invalid'), /Некорректный ID/);
  } finally { db.execute = original; await db.end(); }
});

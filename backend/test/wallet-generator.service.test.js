import assert from "node:assert/strict";
import test from "node:test";

import {
    decryptWalletPrivateKey,
    generateUserWallets,
} from "../src/services/wallet-generator.service.js";

const originalMnemonic = process.env.MASTER_MNEMONIC;
const originalEncryptionKey = process.env.WALLET_ENCRYPTION_KEY;

process.env.MASTER_MNEMONIC = "test test test test test test test test test test test junk";
process.env.WALLET_ENCRYPTION_KEY = "wallet-generator-test-key";

test.after(() => {
    process.env.MASTER_MNEMONIC = originalMnemonic;
    process.env.WALLET_ENCRYPTION_KEY = originalEncryptionKey;
});

test("generates deterministic BTC, ETH, USDT TRC-20 and TRX addresses", () => {
    const first = generateUserWallets(1);
    const second = generateUserWallets(1);

    assert.equal(first.btc.address, "bc1qp533522veg9uyhpx3sva9vqrnfzmt262n4lsuq");
    assert.equal(first.eth.address, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8");
    assert.equal(first.usdt.address, "TPjjvMwjPoDC32V2dGDYTkLH4E5LAtBZ6C");
    assert.equal(first.trx.address, first.usdt.address);
    assert.equal(second.btc.address, first.btc.address);
    assert.equal(second.eth.address, first.eth.address);
    assert.equal(second.usdt.address, first.usdt.address);
    assert.equal(second.trx.address, first.trx.address);
});

test("encrypts private keys with wallet-specific authenticated data", () => {
    const wallets = generateUserWallets(7);

    for (const [currency, wallet] of Object.entries(wallets)) {
        const symbol = currency.toUpperCase();
        assert.match(wallet.privateKey, /^v1:/);
        assert.match(decryptWalletPrivateKey(wallet.privateKey, 7, symbol), /^0x[0-9a-f]{64}$/);
        assert.throws(() => decryptWalletPrivateKey(wallet.privateKey, 8, symbol));
    }
});

test("rejects invalid derivation indexes", () => {
    assert.throws(() => generateUserWallets(-1), /derivation range/);
    assert.throws(() => generateUserWallets(0x80000000), /derivation range/);
});

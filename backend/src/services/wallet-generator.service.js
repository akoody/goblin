import {
    createCipheriv,
    createDecipheriv,
    createHash,
    randomBytes,
} from "node:crypto";
import { HDNodeWallet, keccak256 } from "ethers";
import * as bitcoin from "bitcoinjs-lib";

const MAX_DERIVATION_INDEX = 0x7fffffff;
const PRIVATE_KEY_FORMAT = "v1";

function requireEnvironmentValue(name) {
    const value = String(process.env[name] || "").trim();

    if (!value) {
        throw new Error(`${name} must be set`);
    }

    return value;
}

function normalizeUserId(userId) {
    const index = Number(userId);

    if (!Number.isSafeInteger(index) || index < 0 || index > MAX_DERIVATION_INDEX) {
        throw new Error("User id is outside the supported wallet derivation range");
    }

    return index;
}

function getEncryptionKey() {
    return createHash("sha256")
        .update(requireEnvironmentValue("WALLET_ENCRYPTION_KEY"), "utf8")
        .digest();
}

function getAdditionalData(userId, currency) {
    return Buffer.from(`${userId}:${currency}`, "utf8");
}

export function encryptWalletPrivateKey(privateKey, userId, currency) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
    cipher.setAAD(getAdditionalData(userId, currency));

    const encrypted = Buffer.concat([
        cipher.update(privateKey, "utf8"),
        cipher.final(),
    ]);

    return [
        PRIVATE_KEY_FORMAT,
        iv.toString("base64url"),
        cipher.getAuthTag().toString("base64url"),
        encrypted.toString("base64url"),
    ].join(":");
}

export function decryptWalletPrivateKey(payload, userId, currency) {
    const [format, iv, authTag, encrypted] = String(payload || "").split(":");

    if (format !== PRIVATE_KEY_FORMAT || !iv || !authTag || !encrypted) {
        throw new Error("Unsupported encrypted wallet key format");
    }

    const decipher = createDecipheriv(
        "aes-256-gcm",
        getEncryptionKey(),
        Buffer.from(iv, "base64url")
    );
    decipher.setAAD(getAdditionalData(userId, currency));
    decipher.setAuthTag(Buffer.from(authTag, "base64url"));

    return Buffer.concat([
        decipher.update(Buffer.from(encrypted, "base64url")),
        decipher.final(),
    ]).toString("utf8");
}

function encodeBase58(buffer) {
    const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    let value = BigInt(`0x${buffer.toString("hex")}`);
    let encoded = "";

    while (value > 0n) {
        const remainder = Number(value % 58n);
        value /= 58n;
        encoded = alphabet[remainder] + encoded;
    }

    for (const byte of buffer) {
        if (byte !== 0) break;
        encoded = `1${encoded}`;
    }

    return encoded || "1";
}

function createTronAddress(uncompressedPublicKey) {
    const publicKey = uncompressedPublicKey.replace(/^0x04/, "");
    const addressBody = Buffer.from(keccak256(`0x${publicKey}`).slice(-40), "hex");
    const address = Buffer.concat([Buffer.from([0x41]), addressBody]);
    const firstHash = createHash("sha256").update(address).digest();
    const checksum = createHash("sha256").update(firstHash).digest().subarray(0, 4);

    return encodeBase58(Buffer.concat([address, checksum]));
}

function createWallet(mnemonic, path, userId, currency, getAddress) {
    const wallet = HDNodeWallet.fromPhrase(mnemonic, undefined, path);

    return {
        address: getAddress(wallet),
        privateKey: encryptWalletPrivateKey(wallet.privateKey, userId, currency),
    };
}

export function generateUserWallets(userId) {
    const index = normalizeUserId(userId);
    const mnemonic = requireEnvironmentValue("MASTER_MNEMONIC");

    const btc = createWallet(
        mnemonic,
        `m/84'/0'/0'/0/${index}`,
        index,
        "BTC",
        (wallet) => {
            const payment = bitcoin.payments.p2wpkh({
                pubkey: Buffer.from(wallet.signingKey.compressedPublicKey.slice(2), "hex"),
                network: bitcoin.networks.bitcoin,
            });

            if (!payment.address) {
                throw new Error("Failed to derive BTC address");
            }

            return payment.address;
        }
    );

    const eth = createWallet(
        mnemonic,
        `m/44'/60'/0'/0/${index}`,
        index,
        "ETH",
        (wallet) => wallet.address
    );

    const usdt = createWallet(
        mnemonic,
        `m/44'/195'/0'/0/${index}`,
        index,
        "USDT",
        (wallet) => createTronAddress(wallet.signingKey.publicKey)
    );

    const trx = createWallet(
        mnemonic,
        `m/44'/195'/0'/0/${index}`,
        index,
        "TRX",
        (wallet) => createTronAddress(wallet.signingKey.publicKey)
    );

    return { btc, eth, usdt, trx };
}

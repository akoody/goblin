ALTER TABLE wallets
    DROP INDEX uq_wallet_address,
    ADD UNIQUE KEY uq_wallet_currency_address (currency, address);

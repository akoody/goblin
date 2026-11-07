# Solana custody and SOL to SPL swaps

Run migrations before starting. New migration 027 stores encrypted per-user Solana signing keys, mint-keyed atomic token balances, receipt cursors and durable swap reservations. Existing wallets are preserved. A Solana address is generated lazily when a user opens `/swap`.

Configuration (server secrets, never browser variables):

- `SOLANA_RPC_URL`: archival-capable mainnet RPC with finalized transaction history and simulation support.
- `SOLANA_EXPECTED_GENESIS`: defaults to mainnet. Explicitly set the devnet genesis when testing devnet. Never share a database between clusters.
- `JUPITER_API_KEY`: Jupiter Swap API V2 key.
- `SOLANA_SWAP_SIGNING_ENABLED=true`: explicit operational activation after verification.
- `WALLET_ENCRYPTION_KEY`: existing wallet encryption secret; back it up securely. Losing it loses access to the Solana keys.

Admin → Solana и свап: enable swaps, minimum SOL per swap, maximum additional SOL reservation. Default: disabled, 0.01 SOL minimum and 0.01 SOL fee/rent reserve. Config updates are audited. A quote expires in 40 seconds. The user approves the displayed mint, amount, output minimum, slippage and fee reserve. Only SOL → classic SPL, Jupiter Metis routes are enabled; Token-2022 and freeze-authority mints are rejected.

Finalized incoming native SystemProgram transfers are recorded through the existing deposit policy and AML queue. Safio gets SOL/solana requests. Unsupported provider coverage holds funds for manual review. No transaction with this wallet as signer is treated as an incoming deposit. Unsolicited SPL receipts are recorded as `review` and are not spendable. Swapped tokens are credited to mint-specific holdings only after finalized receipt validation. Symbols/tickers never identify an asset.

The signed transaction and signature are saved together with a locked SOL reservation before broadcast. Timeouts retain the reservation; reconciliation queries finalized receipts, rebroadcasts only the same signed bytes, and never constructs a replacement swap. Missing transactions are released only after finalized block height exceeds expiry plus 150 blocks and history lookup finds no signature. A mismatched receipt enters `review` and retains its reservation. Failed finalized transactions charge their actual SOL loss and release the remainder. Successful transactions credit the observed token increase and charge observed SOL loss, including rent/fees. Native SOL is held in the ordinary wallet ledger; SPL amounts use integer atomic values in a separate ledger.

Before activation verify: funded devnet receive/restart/replay, insufficient funds, failed and expired transactions, timeout after broadcast, concurrent execution, exact reserve release, output token ownership, real mainnet quote/simulation and a small explicitly approved mainnet swap. Jupiter does not offer mainnet liquidity on devnet; use fixture transactions there. The application test suite does not prove live provider execution. No live swaps or funds transfers are performed during installation.

Review queue: GET `/api/solana/admin/review`. Do not manually unlock a review reservation without reconciling the recorded signature. Outgoing SPL withdrawals and Token-2022 are not enabled by this rollout.

# TRX ↔ USDT swaps

SunSwap V2 mainnet router: `TNJVzGqKBWkJxJB5XYSqGAwUTV15U24pPq`.
WTRX: `TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR`.
USDT uses the existing canonical TRON contract.

Run migration 028 before restarting. `TRONGRID_API_KEY` is already required by TRON processing. The administrator enables swaps in Admin → Свап TRON. New policy defaults to disabled. `TRON_SWAP_SIGNING_ENABLED=false` is an optional server-side emergency stop for creating new signed transactions. Already-signed transactions are still reconciled. No transactions are sent by enabling settings alone; each swap requires user quote confirmation.

Default minima: 10 TRX and 5 USDT. Default energy budget: 150 TRX for the entire operation, split across required transactions. Reserve also includes 2 TRX per transaction for bandwidth. These are conservative maximum reserves, not a fixed service fee; final settlement charges receipt.fee, releases unused reserve and records the observed output. The pool's fee is already included in getAmountsOut. No additional Goblin fee is imposed.

TRX and USDT must share the same custodial address. Legacy accounts with different addresses cannot swap until migrated through a separately reviewed wallet migration. Existing deposits, transfers and balances are preserved. An active withdrawal blocks a new swap; an active/review swap blocks external withdrawals. Available balance checks include existing locks.

For USDT→TRX, the worker checks allowance, optionally resets it to zero, approves exactly the input and then swaps. Every signed transaction is persisted before broadcast. Each step must have a solid SUCCESS receipt before the next. Unknown broadcasts are retried only with identical bytes. Unresolved expired transactions and receipt mismatches retain reserves in review. Never manually unlock these without checking every recorded transaction.

The deposit scanner excludes all recorded swap transaction hashes. Thus output transfers are settled only by the swap ledger and cannot receive a second deposit credit or deposit fee. Settlement and reservation release occur in one database transaction and cannot run twice.

Before enabling for customers, verify with a funded dedicated test account: both directions, zero/nonzero allowance, insufficient TRX, slippage revert, timeout, restart and refund/reserve release. Quote and contract reads were tested without moving funds. Automated tests do not constitute a funded end-to-end test. Router is deliberately V2 direct WTRX/USDT, not SUN's Universal Router; this avoids arbitrary externally supplied call data and unlimited Permit2 approvals. It does not claim best price across all SunSwap pools.

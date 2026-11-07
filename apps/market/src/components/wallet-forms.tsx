"use client";

import { useActionState } from "react";
import { cryptoTopUpWalletAction, topUpWalletAction, type FormState, withdrawWalletAction } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";

const initialState: FormState = {};

type WalletFormsProps = {
  preferredCurrency: "RUB" | "USD" | "EUR";
};

export function WalletForms({ preferredCurrency }: WalletFormsProps) {
  const [topUpState, topUpFormAction] = useActionState(topUpWalletAction, initialState);
  const [cryptoTopUpState, cryptoTopUpFormAction] = useActionState(cryptoTopUpWalletAction, initialState);
  const [withdrawState, withdrawFormAction] = useActionState(withdrawWalletAction, initialState);

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <form action={topUpFormAction} className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/60">
        <div className="text-sm font-semibold  text-slate-400">Пополнение</div>
        <div className="mt-4 space-y-4">
          <input
            name="amount"
            type="number"
            min={1}
            step="1"
            placeholder="Сумма"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-base outline-none focus:border-slate-300"
          />
          <select
            name="currency"
            defaultValue={preferredCurrency}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-base outline-none focus:border-slate-300"
          >
            <option value="RUB">RUB</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
          </select>
          {topUpState.error ? <div className="text-sm text-rose-600">{topUpState.error}</div> : null}
          {topUpState.success ? <div className="text-sm text-emerald-600">{topUpState.success}</div> : null}
          <SubmitButton className="w-full">Пополнить баланс</SubmitButton>
        </div>
      </form>

      <form action={cryptoTopUpFormAction} className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/60">
        <div className="text-sm font-semibold  text-slate-400">Crypto</div>
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <select
              name="asset"
              defaultValue="USDT"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-base outline-none focus:border-slate-300"
            >
              <option value="USDT">USDT</option>
              <option value="BTC">BTC</option>
              <option value="ETH">ETH</option>
              <option value="TON">TON</option>
            </select>
            <input
              name="network"
              placeholder="TRC20 / TON / ERC20"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-base outline-none focus:border-slate-300"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <input
              name="amount"
              type="number"
              min={1}
              step="1"
              placeholder="Сумма к зачислению"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-base outline-none focus:border-slate-300"
            />
            <select
              name="currency"
              defaultValue={preferredCurrency}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-base outline-none focus:border-slate-300"
            >
              <option value="RUB">RUB</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          </div>
          <input
            name="txHash"
            placeholder="Hash транзакции"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-base outline-none focus:border-slate-300"
          />
          {cryptoTopUpState.error ? <div className="text-sm text-rose-600">{cryptoTopUpState.error}</div> : null}
          {cryptoTopUpState.success ? <div className="text-sm text-emerald-600">{cryptoTopUpState.success}</div> : null}
          <SubmitButton className="w-full">Отправить crypto-платёж на проверку</SubmitButton>
        </div>
      </form>

      <form action={withdrawFormAction} className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/60">
        <div className="text-sm font-semibold  text-slate-400">Вывод</div>
        <div className="mt-4 space-y-4">
          <textarea name="details" required minLength={5} maxLength={800} placeholder="Реквизиты для выплаты и способ вывода" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-base outline-none focus:border-slate-300" />
          <input
            name="amount"
            type="number"
            min={1}
            step="1"
            placeholder="Сумма"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-base outline-none focus:border-slate-300"
          />
          <select
            name="currency"
            defaultValue={preferredCurrency}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-base outline-none focus:border-slate-300"
          >
            <option value="RUB">RUB</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
          </select>
          {withdrawState.error ? <div className="text-sm text-rose-600">{withdrawState.error}</div> : null}
          {withdrawState.success ? <div className="text-sm text-emerald-600">{withdrawState.success}</div> : null}
          <SubmitButton className="w-full">Вывести средства</SubmitButton>
        </div>
      </form>
    </div>
  );
}

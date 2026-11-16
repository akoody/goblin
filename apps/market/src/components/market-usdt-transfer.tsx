"use client";

import {useActionState,useState} from "react";
import {transferMarketUsdtAction,type FormState} from "@/app/actions";
import {SubmitButton} from "@/components/submit-button";
import {formatUsdt} from "@/lib/utils";

export function MarketUsdtTransfer({market,exchange,initialKey}:{market:string;exchange:string;initialKey:string}) {
  const [state,submit,pending]=useActionState(transferMarketUsdtAction,{} as FormState);
  const [direction,setDirection]=useState("TO_MARKET");
  const [amount,setAmount]=useState("");
  const [requestKey,setRequestKey]=useState(initialKey);
  return <section className="rounded-lg border border-slate-200 bg-white p-5 sm:p-8">
    <h2 className="text-xl font-semibold text-slate-950">Перевод USDT между биржей и маркетом</h2>
    <p className="mt-2 text-sm text-slate-600">На бирже доступно {formatUsdt(exchange)} · На маркете {formatUsdt(market)} · Без комиссии</p>
    <form action={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="requestKey" value={requestKey}/>
      <label className="grid gap-1">Направление
        <select name="direction" value={direction} disabled={pending} className="rounded-lg border border-slate-200 px-3 py-2" onChange={e=>{setDirection(e.target.value);setRequestKey(crypto.randomUUID());}}>
          <option value="TO_MARKET">С биржи на маркет</option>
          <option value="TO_EXCHANGE">С маркета на биржу</option>
        </select>
      </label>
      <label className="grid gap-1">Сумма USDT
        <input name="amount" inputMode="decimal" required maxLength={15} value={amount} disabled={pending} className="rounded-lg border border-slate-200 px-3 py-2" onChange={e=>{setAmount(e.target.value.replace(",", "."));setRequestKey(crypto.randomUUID());}}/>
      </label>
      <SubmitButton className="sm:col-span-2">Перевести USDT</SubmitButton>
    </form>
    {state.error&&<p className="mt-3 text-sm text-rose-600" role="alert">{state.error}</p>}
    {state.success&&<p className="mt-3 text-sm text-green-700" role="status">{state.success}</p>}
  </section>;
}

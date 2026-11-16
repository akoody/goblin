"use client";

import { useActionState, useState } from "react";
import { createPurchaseAction, type FormState } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import { formatUsdt } from "@/lib/utils";

const initialState: FormState = {};

type PurchaseFormProps = {
  listingId: string;
  requestKey: string;
  priceUsdt: string;
};

export function PurchaseForm({ listingId, requestKey, priceUsdt }: PurchaseFormProps) {
  const [state, formAction] = useActionState(createPurchaseAction, initialState);
  const [quantity, setQuantity] = useState(1);
  const total = formatUsdt(priceUsdt, quantity);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="listingId" value={listingId} />
      <input type="hidden" name="requestKey" value={requestKey} />

      <label className="flex flex-col gap-2">
        <span className="text-sm font-semibold  text-slate-400">Получу</span>
        <input
          name="quantity"
          type="number"
          min={1}
          value={quantity}
          max={100000}
          onChange={(event) => setQuantity(Math.max(1, Math.min(100000, Math.trunc(Number(event.target.value)) || 1)))}
          className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3.5 text-base font-semibold outline-none focus:border-slate-300"
        />
      </label>

      <div className="rounded-lg border border-slate-200 bg-white px-4 py-3.5">
        <div className="text-sm font-semibold  text-slate-400">Заплачу</div>
        <div className="mt-1 text-2xl font-semibold text-slate-950">{total}</div>
        <div className="mt-1 text-sm text-slate-500">за {quantity} шт. по {formatUsdt(priceUsdt)}</div>
      </div>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-semibold  text-slate-400">Сообщение продавцу</span>
        <textarea
          name="message"
          rows={4}
          placeholder="Напиши ник, платформу, регион или другие детали для выдачи."
          className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3.5 text-base outline-none focus:border-slate-300"
        />
      </label>

      {state.error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">{state.error}</div> : null}

      <SubmitButton className="w-full">Купить</SubmitButton>
    </form>
  );
}

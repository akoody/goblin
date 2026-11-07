"use client";

import { useActionState, useState } from "react";
import { createPurchaseAction, type FormState } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import { formatCurrency } from "@/lib/utils";

const initialState: FormState = {};

type PurchaseFormProps = {
  listingId: string;
  priceRub: number;
  preferredCurrency: "RUB" | "USD" | "EUR";
};

export function PurchaseForm({ listingId, priceRub, preferredCurrency }: PurchaseFormProps) {
  const [state, formAction] = useActionState(createPurchaseAction, initialState);
  const [quantity, setQuantity] = useState(1);
  const total = priceRub * quantity;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="listingId" value={listingId} />

      <label className="flex flex-col gap-2">
        <span className="text-sm font-semibold  text-slate-400">Получу</span>
        <input
          name="quantity"
          type="number"
          min={1}
          value={quantity}
          onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))}
          className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3.5 text-base font-semibold outline-none focus:border-slate-300"
        />
      </label>

      <div className="rounded-lg border border-slate-200 bg-white px-4 py-3.5">
        <div className="text-sm font-semibold  text-slate-400">Заплачу</div>
        <div className="mt-1 text-2xl font-semibold text-slate-950">{formatCurrency(total, preferredCurrency)}</div>
        <div className="mt-1 text-sm text-slate-500">за {quantity} шт. по {formatCurrency(priceRub, preferredCurrency)}</div>
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

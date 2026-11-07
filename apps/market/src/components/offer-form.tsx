"use client";

import { useActionState } from "react";
import { createOfferAction, type FormState } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";

const initialState: FormState = {};

type OfferFormProps = {
  projectId: string;
};

export function OfferForm({ projectId }: OfferFormProps) {
  const [state, formAction] = useActionState(createOfferAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="projectId" value={projectId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-slate-200">Цена оффера</span>
          <input
            name="price"
            type="number"
            required
            min={1000}
            defaultValue={30000}
          className="rounded-lg border border-white/10 bg-slate-950/70 px-4 py-3.5 text-base outline-none transition focus:border-emerald-400 sm:text-sm"
        />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-slate-200">Срок (дней)</span>
          <input
            name="deliveryDays"
            type="number"
            required
            min={1}
            defaultValue={5}
          className="rounded-lg border border-white/10 bg-slate-950/70 px-4 py-3.5 text-base outline-none transition focus:border-emerald-400 sm:text-sm"
        />
        </label>
      </div>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium text-slate-200">Сообщение заказчику</span>
        <textarea
          name="message"
          required
          minLength={30}
          rows={5}
          placeholder="Опиши, как именно решишь задачу, что войдёт в работу и что покажешь на первом этапе."
          className="rounded-lg border border-white/10 bg-slate-950/70 px-4 py-3.5 text-base outline-none transition placeholder:text-slate-500 focus:border-emerald-400 sm:text-sm"
        />
      </label>

      {state.error ? (
        <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {state.error}
        </p>
      ) : null}

      <SubmitButton className="w-full">Отправить оффер и открыть чат</SubmitButton>
    </form>
  );
}

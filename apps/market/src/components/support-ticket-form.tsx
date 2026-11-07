"use client";

import { useActionState } from "react";
import { createSupportTicketAction, type FormState } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";

const initialState: FormState = {};

export function SupportTicketForm() {
  const [state, formAction] = useActionState(createSupportTicketAction, initialState);

  return (
    <form action={formAction} className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/60">
      <div className="text-sm font-semibold  text-slate-400">Новый запрос</div>
      <div className="mt-4 space-y-4">
        <input
          name="subject"
          placeholder="Тема обращения"
          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-slate-300"
        />
        <textarea
          name="text"
          rows={5}
          placeholder="Опиши проблему, заказ или вопрос максимально конкретно."
          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-slate-300"
        />
        {state.error ? <div className="text-sm text-rose-600">{state.error}</div> : null}
        {state.success ? <div className="text-sm text-emerald-600">{state.success}</div> : null}
        <SubmitButton className="w-full">Отправить запрос</SubmitButton>
      </div>
    </form>
  );
}

"use client";

import { useActionState } from "react";
import { sendMessageAction, type FormState } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";

const initialState: FormState = {};

type MessageFormProps = {
  conversationId: string;
};

export function MessageForm({ conversationId }: MessageFormProps) {
  const [state, formAction] = useActionState(sendMessageAction, initialState);

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/50 sm:p-5">
      <input type="hidden" name="conversationId" value={conversationId} />
      <textarea
        name="text"
        rows={4}
        required
        placeholder="Напиши сообщение по заказу, этапам или деталям выдачи."
        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3.5 text-base outline-none transition placeholder:text-slate-400 focus:border-slate-300 sm:text-sm"
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {state.error ? <p className="text-sm text-rose-600">{state.error}</p> : <span className="text-sm text-slate-500">Сообщение появится в диалоге сразу после отправки.</span>}
        <SubmitButton className="w-full sm:min-w-36 sm:w-auto">Отправить</SubmitButton>
      </div>
    </form>
  );
}

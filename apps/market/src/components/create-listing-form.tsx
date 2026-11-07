"use client";

import { useActionState } from "react";
import { createListingAction, type FormState } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";

const initialState: FormState = {};

type CreateListingFormProps = {
  itemSlug: string;
  itemName: string;
  sectionId: string;
  sectionName: string;
  preferredCurrency: "RUB" | "USD" | "EUR";
};

export function CreateListingForm({
  itemSlug,
  itemName,
  sectionId,
  sectionName,
  preferredCurrency,
}: CreateListingFormProps) {
  const [state, formAction] = useActionState(createListingAction, initialState);

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="itemSlug" value={itemSlug} />
      <input type="hidden" name="sectionId" value={sectionId} />
      <input type="hidden" name="isActive" value="true" />

      <div className="rounded-lg bg-slate-50 p-5">
        <div className="text-sm font-semibold  text-slate-400">Раздел</div>
        <div className="mt-2 text-xl font-semibold text-slate-950 sm:text-2xl">
          {itemName} · {sectionName}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <label className="flex flex-col gap-2 lg:col-span-2">
          <span className="text-sm font-medium text-slate-700">Данные для автоматической выдачи</span>
          <textarea name="autoPayloads" rows={4} placeholder="Для AUTO: по одному товару или коду на строку. Данные выдаются в личном чате после оплаты." className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3.5 text-base outline-none focus:border-slate-300" />
        </label>
        <label className="flex flex-col gap-2 lg:col-span-2">
          <span className="text-sm font-medium text-slate-700">Краткое описание</span>
          <input
            name="title"
            required
            minLength={10}
            placeholder={`Например: ${itemName} ${sectionName.toLowerCase()} с гарантией`}
            className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3.5 text-base outline-none focus:border-slate-300"
          />
        </label>

        <label className="flex flex-col gap-2 lg:col-span-2">
          <span className="text-sm font-medium text-slate-700">Подробное описание</span>
          <textarea
            name="description"
            required
            minLength={30}
            rows={7}
            placeholder="Опиши, что получает покупатель, как проходит выдача и какие есть условия."
            className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3.5 text-base outline-none focus:border-slate-300"
          />
        </label>

        <label className="flex flex-col gap-2 lg:col-span-2">
          <span className="text-sm font-medium text-slate-700">Сообщение покупателю после оплаты</span>
          <textarea
            name="deliveryNote"
            rows={4}
            placeholder="Можно не заполнять. Например: что прислать вам в чат, какой ник или регион нужен."
            className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3.5 text-base outline-none focus:border-slate-300"
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-slate-700">Цена за 1 шт.</span>
          <input
            name="price"
            type="number"
            min={1}
            required
            defaultValue={10}
            className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3.5 text-base outline-none focus:border-slate-300"
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-slate-700">Валюта</span>
          <select
            name="currency"
            defaultValue={preferredCurrency}
            className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3.5 text-base outline-none focus:border-slate-300"
          >
            <option value="RUB">RUB</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
          </select>
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-slate-700">Наличие</span>
          <input
            name="quantity"
            type="number"
            min={1}
            defaultValue={1}
            className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3.5 text-base outline-none focus:border-slate-300"
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-slate-700">Выдача</span>
          <select
            name="deliveryType"
            defaultValue="MANUAL"
            className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3.5 text-base outline-none focus:border-slate-300"
          >
            <option value="MANUAL">Ручная выдача</option>
            <option value="AUTO">Автоматическая выдача</option>
          </select>
        </label>
      </div>

      {state.error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">{state.error}</div> : null}
      <SubmitButton className="w-full">Сохранить предложение</SubmitButton>
    </form>
  );
}

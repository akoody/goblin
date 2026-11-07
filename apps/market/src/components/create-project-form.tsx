"use client";

import { useActionState, useState } from "react";
import { createProjectAction, type FormState } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import type { CurrencyCode, ProjectFormConfig, ProjectPlatform, ProjectServiceType } from "@/lib/db";

const initialState: FormState = {};

type CreateProjectFormProps = {
  preferredCurrency: CurrencyCode;
  config: ProjectFormConfig;
};

export function CreateProjectForm({ preferredCurrency, config }: CreateProjectFormProps) {
  const [state, formAction] = useActionState(createProjectAction, initialState);
  const firstPlatform = config.platforms[0] ?? null;
  const [platform, setPlatform] = useState<ProjectPlatform>(firstPlatform?.id ?? "TELEGRAM");
  const [serviceType, setServiceType] = useState<ProjectServiceType>(firstPlatform?.services[0]?.id ?? "SUBSCRIBE");
  const platformData = config.platforms.find((entry) => entry.id === platform) ?? firstPlatform;
  const availableServices = platformData?.services ?? [];
  const serviceData = availableServices.find((service) => service.id === serviceType) ?? availableServices[0] ?? null;

  if (!platformData || !serviceData) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-700">
        Нет активных платформ и услуг. Включи их в админке.
      </div>
    );
  }

  return (
    <form action={formAction} className="grid gap-5 lg:grid-cols-2">
      <label className="flex flex-col gap-2 lg:col-span-2">
        <span className="text-sm font-medium text-slate-700">Название объявления</span>
        <input
          name="title"
          required
          minLength={10}
          placeholder={`Например: ${serviceData.titlePlaceholder} для ${platformData.label}`}
          className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3.5 text-base outline-none focus:border-slate-300"
        />
      </label>

      <label className="flex flex-col gap-2 lg:col-span-2">
        <span className="text-sm font-medium text-slate-700">Описание задачи</span>
        <textarea
          name="description"
          required
          minLength={40}
          rows={5}
          placeholder={serviceData.descriptionPlaceholder}
          className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3.5 text-base outline-none focus:border-slate-300"
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium text-slate-700">Платформа</span>
        <select
          name="platform"
          required
          className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3.5 text-base outline-none focus:border-slate-300"
          value={platform}
          onChange={(event) => {
            const nextPlatform = event.target.value as ProjectPlatform;
            const nextPlatformData = config.platforms.find((entry) => entry.id === nextPlatform);
            const nextServices = nextPlatformData?.services ?? [];
            setPlatform(nextPlatform);

            if (nextServices[0]) {
              setServiceType(nextServices[0].id);
            }
          }}
        >
          {config.platforms.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium text-slate-700">Услуга</span>
        <select
          name="serviceType"
          required
          className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3.5 text-base outline-none focus:border-slate-300"
          value={serviceType}
          onChange={(event) => setServiceType(event.target.value as ProjectServiceType)}
        >
          {availableServices.map((service) => (
            <option key={service.id} value={service.id}>
              {service.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium text-slate-700">Источник отслеживания</span>
        <input
          name="targetSource"
          required
          placeholder={platformData.sourcePlaceholder}
          className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3.5 text-base outline-none focus:border-slate-300"
        />
      </label>

      <label className="flex flex-col gap-2 lg:col-span-2">
        <span className="text-sm font-medium text-slate-700">{serviceData.messageLabel ?? "Текст сообщения, комментария или ЛС"}</span>
        <textarea
          name="messageText"
          minLength={5}
          rows={5}
          placeholder={
            serviceData.messagePlaceholder.trim() ||
            "Для просмотров, лайков, репостов и подписок можно не заполнять. Для рассылки, комментариев и ЛС укажи текст выполнения."
          }
          className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3.5 text-base outline-none focus:border-slate-300"
        />
      </label>

      <label className="flex flex-col gap-2 lg:col-span-2">
        <span className="text-sm font-medium text-slate-700">{platformData.targetsLabel}</span>
        <textarea
          name="targets"
          required
          rows={7}
          placeholder={platformData.targetsPlaceholder}
          className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3.5 text-base outline-none focus:border-slate-300"
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium text-slate-700">Выплата за 1 цель</span>
        <input
          name="rewardPerTarget"
          type="number"
          min={1}
          defaultValue={50}
          required
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

      {state.error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600 lg:col-span-2">
          {state.error}
        </p>
      ) : null}

      <SubmitButton className="lg:col-span-2">Опубликовать объявление</SubmitButton>
    </form>
  );
}

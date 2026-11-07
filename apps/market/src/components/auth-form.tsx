"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, registerAction, type FormState } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";

const initialState: FormState = {};

type AuthFormProps = {
  mode: "login" | "register";
};

export function AuthForm({ mode }: AuthFormProps) {
  const action = mode === "login" ? loginAction : registerAction;
  const [state, formAction] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-5">
      {mode === "register" ? (
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-slate-700">Имя</span>
          <input
            name="name"
            required
            autoComplete="name"
            placeholder="Например, Владислав"
            className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3.5 text-base outline-none transition placeholder:text-slate-400 focus:border-slate-300 sm:text-sm"
          />
        </label>
      ) : null}

      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium text-slate-700">Email</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3.5 text-base outline-none transition placeholder:text-slate-400 focus:border-slate-300 sm:text-sm"
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium text-slate-700">Пароль</span>
        <input
          name="password"
          type="password"
          required
          minLength={mode==='login'?1:8}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          placeholder="Минимум 8 символов"
          className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3.5 text-base outline-none transition placeholder:text-slate-400 focus:border-slate-300 sm:text-sm"
        />
        <span className="text-xs leading-6 text-slate-400">
          {mode === "login"
            ? "Используй пароль от своего рабочего аккаунта."
            : "Пароль нужен минимум на 8 символов. Лучше использовать длинную фразу, а не короткое слово."}
        </span>
      </label>

      {state.error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
          {state.error}
        </p>
      ) : null}

      <SubmitButton className="w-full">
        {mode === "login" ? "Войти" : "Создать аккаунт"}
      </SubmitButton>
      {mode==='login'?<a href="/reset-pass" className="block text-sm font-semibold text-green-700">Забыли пароль?</a>:null}

      <p className="text-sm text-slate-500">
        {mode === "login" ? "Нет аккаунта?" : "Уже есть аккаунт?"}{" "}
        <Link
          href={mode === "login" ? "/register" : "/login"}
          className="font-semibold text-green-700 hover:text-green-800"
        >
          {mode === "login" ? "Регистрация" : "Войти"}
        </Link>
      </p>
    </form>
  );
}

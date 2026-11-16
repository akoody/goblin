"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { loginAction, registerAction, type FormState } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";

const initialState: FormState = {};

type AuthFormProps = {
  mode: "login" | "register";
};

export function AuthForm({ mode }: AuthFormProps) {
  const action = mode === "login" ? loginAction : registerAction;
  const [state, formAction] = useActionState(action, initialState);
  const [identifier,setIdentifier] = useState('');
  const needsCode=mode==="login"&&Boolean(state.challenge);

  return (
    <form action={formAction} className="space-y-5">
      {needsCode ? (
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-slate-700">Код Authenticator или резервный код</span>
          <input name="code" required maxLength={40} autoComplete="one-time-code" autoCapitalize="off" spellCheck={false}
            className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3.5 text-base outline-none focus:border-slate-300"/>
        </label>
      ) : <>
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
        <span className="text-sm font-medium text-slate-700">{mode==='login'?'Логин или email':'Email'}</span>
        <input
          name="email"
          value={identifier}
          onChange={event=>setIdentifier(event.target.value)}
          type={mode==='login'?'text':'email'}
          required
          autoComplete={mode==='login'?'username':'email'}
          maxLength={254}
          autoCapitalize="none"
          spellCheck={false}
          placeholder={mode==='login'?'Ник или you@example.com':'you@example.com'}
          className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3.5 text-base outline-none transition placeholder:text-slate-400 focus:border-slate-300 sm:text-sm"
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium text-slate-700">Пароль</span>
        <input
          name="password"
          aria-label="Пароль"
          type="password"
          required
          minLength={mode==='login'?1:10}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          placeholder={mode==='login'?'Пароль от аккаунта биржи':'Минимум 10 символов, буквы и цифры'}
          className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3.5 text-base outline-none transition placeholder:text-slate-400 focus:border-slate-300 sm:text-sm"
        />
        <span className="text-xs leading-6 text-slate-400">
          {mode === "login"
            ? "Используйте логин или email и пароль от биржи. Аккаунт для биржи и маркета общий."
            : "Минимум 10 символов, буквы и цифры. Максимум 72 байта."}
        </span>
      </label>
      </>}

      {state.error ? (
        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
          {state.error}
        </p>
      ) : null}

      <SubmitButton className="w-full">
        {needsCode ? "Подтвердить вход" : mode === "login" ? "Войти" : "Создать аккаунт"}
      </SubmitButton>
      {needsCode?<button type="submit" name="cancelAuthenticator" value="1" formNoValidate className="block text-sm font-semibold text-green-700">Вернуться к паролю</button>:
        mode==='login'?<a href="/reset-pass" className="block text-sm font-semibold text-green-700">Забыли пароль?</a>:null}

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

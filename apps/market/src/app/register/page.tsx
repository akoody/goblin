import { redirect } from "@/lib/market-navigation";
import { AuthForm } from "@/components/auth-form";
import { getCurrentUser } from "@/lib/auth";
import { getAuthenticatedHomePath } from "@/lib/admin";

export default async function RegisterPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect(getAuthenticatedHomePath(user));
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 items-center py-8 sm:py-12">
      <div className="grid w-full gap-6 lg:grid-cols-[0.88fr_1.12fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/60 sm:p-8">
          <div className="mb-8">
            <div className="text-sm font-semibold  text-slate-400">Регистрация</div>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">Создать аккаунт</h1>
            <p className="mt-4 text-base leading-8 text-slate-500">
              Новый аккаунт сразу получает доступ к библиотеке игр и сервисов, кошельку, заказам и переписке.
            </p>
          </div>
          <AuthForm mode="register" />
        </div>

        <div className="hidden rounded-lg border border-slate-200 bg-white p-8 lg:block">
          <div className="font-(family-name:--font-space-grotesk) text-3xl font-bold tracking-[-0.06em] text-slate-950">
            Личный кабинет без пустых экранов
          </div>
          <div className="mt-4 max-w-xl text-lg leading-8 text-slate-600">
            После регистрации можно искать товары по библиотеке, следить за заказами, менять валюту отображения и
            работать с поддержкой через встроенные разделы.
          </div>
        </div>
      </div>
    </div>
  );
}

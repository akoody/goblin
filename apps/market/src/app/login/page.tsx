import { redirect } from "@/lib/market-navigation";
import { AuthForm } from "@/components/auth-form";
import { getCurrentUser } from "@/lib/auth";
import { getAuthenticatedHomePath } from "@/lib/admin";

export default async function LoginPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect(getAuthenticatedHomePath(user));
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 items-center py-8 sm:py-12">
      <div className="grid w-full gap-6 lg:grid-cols-[0.88fr_1.12fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/60 sm:p-8">
          <div className="mb-8">
            <div className="text-sm font-semibold  text-slate-400">Авторизация</div>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">Войти</h1>
            <p className="mt-4 text-base leading-8 text-slate-500">
              После входа откроются покупки, продажи, чаты, кошелёк и весь каталог с персональными настройками.
            </p>
          </div>
          <AuthForm mode="login" />
        </div>

        <div className="hidden rounded-lg border border-slate-200 bg-white p-8 lg:block">
          <div className="font-(family-name:--font-space-grotesk) text-3xl font-bold tracking-[-0.06em] text-slate-950">
            Goblin Market
          </div>
          <div className="mt-4 max-w-xl text-lg leading-8 text-slate-600">
            Каталог аккаунтов, подписок, игровой валюты, ключей и цифровых офферов с покупками, продажами,
            перепиской и админским контролем в одном контуре.
          </div>
        </div>
      </div>
    </div>
  );
}

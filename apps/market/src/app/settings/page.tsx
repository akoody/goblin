import { updateCurrencyAction } from "@/app/actions";
import { requireUser } from "@/lib/auth";
import { supportedCurrencies } from "@/lib/constants";
import { isAdminUser } from "@/lib/admin";
import { getCurrencyLabel } from "@/lib/utils";

export default async function SettingsPage() {
  const user = await requireUser();
  const admin = isAdminUser(user);

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/60 sm:p-8">
        <div className="text-sm font-semibold  text-slate-400">Настройки</div>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950 sm:text-3xl">Личный кабинет</h1>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/60">
          <div className="text-2xl font-semibold text-slate-950">Личное</div>
          <div className="mt-5 space-y-3 text-slate-600">
            <div className="rounded-lg bg-slate-50 p-4">
              <div className="text-sm text-slate-400">Имя</div>
              <div className="mt-1 font-semibold text-slate-950">{user.name}</div>
            </div>
            <div className="rounded-lg bg-slate-50 p-4">
              <div className="text-sm text-slate-400">Email</div>
              <div className="mt-1 font-semibold text-slate-950">{user.email}</div>
            </div>
            <div className="rounded-lg bg-slate-50 p-4">
              <div className="text-sm text-slate-400">Роль</div>
              <div className="mt-1 font-semibold text-slate-950">{admin ? "Администратор" : "Покупатель / продавец"}</div>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/60">
          <div className="text-2xl font-semibold text-slate-950">Валюта отображения</div>
          <div className="mt-5 flex flex-wrap gap-3">
            {supportedCurrencies.map((currency) => (
              <form key={currency.code} action={updateCurrencyAction} className="flex-1 sm:flex-none">
                <input type="hidden" name="currency" value={currency.code} />
                <input type="hidden" name="returnTo" value="/settings" />
                <button
                  type="submit"
                  disabled={admin}
                  className={`w-full rounded-md px-4 py-3 text-sm font-semibold ${
                    user.preferredCurrency === currency.code
                      ? "bg-slate-950 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  } ${admin ? "cursor-not-allowed opacity-60" : ""}`}
                >
                  {getCurrencyLabel(currency.code)}
                </button>
              </form>
            ))}
          </div>

          <div className="mt-8 rounded-lg bg-slate-50 p-5 text-sm leading-7 text-slate-500">
            Язык интерфейса сейчас зафиксирован на русском. Переключатель валюты влияет на библиотеку, кошелёк,
            заказы и карточки офферов.
          </div>
        </div>
      </section>
    </div>
  );
}

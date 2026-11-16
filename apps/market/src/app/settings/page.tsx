import { requireUser } from "@/lib/auth";
import { isAdminUser } from "@/lib/admin";

export default async function SettingsPage() {
  const user = await requireUser();
  const admin = isAdminUser(user);

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/60 sm:p-8">
        <div className="text-sm font-semibold  text-slate-400">Настройки</div>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950 sm:text-3xl">Личный кабинет</h1>
      </section>

      <section className="grid gap-6">
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
          <h2 className="text-2xl font-semibold text-slate-950">Безопасность</h2>
          <a href="/me?section=security" className="mt-3 inline-block font-semibold text-green-700">Настроить Authenticator</a>
        </div>

      </section>
    </div>
  );
}

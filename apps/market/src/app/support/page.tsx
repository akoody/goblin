import { unstable_noStore as noStore } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getSupportOverview } from "@/lib/db";
import { SupportTicketForm } from "@/components/support-ticket-form";
import { formatDateTime, formatTicketStatus } from "@/lib/utils";

export default async function SupportPage() {
  noStore();

  const user = await requireUser();
  const overview = (await getSupportOverview(user.id));

  return (
    <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <div className="space-y-6">
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/60 sm:p-8">
          <div className="text-sm font-semibold  text-slate-400">Поддержка</div>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">Помощь и запросы</h1>
          <p className="mt-4 text-base leading-8 text-slate-500">
            Здесь собраны ваши обращения, а также базовые правила: безопасная сделка проходит только внутри сайта,
            спорные кейсы решаются через поддержку.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-slate-50 p-4">
              <div className="text-sm text-slate-500">Открытых запросов</div>
              <div className="mt-2 text-2xl font-semibold text-slate-950">{overview.openCount}</div>
            </div>
            <div className="rounded-lg bg-slate-50 p-4">
              <div className="text-sm text-slate-500">С ответом</div>
              <div className="mt-2 text-2xl font-semibold text-slate-950">{overview.answeredCount}</div>
            </div>
          </div>
        </section>

        <SupportTicketForm />
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/60 sm:p-8">
        <div className="mb-5">
          <div className="text-sm font-semibold  text-slate-400">История</div>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">Мои обращения</h2>
        </div>

        <div className="space-y-4">
          {overview.tickets.map((ticket) => (
            <div key={ticket.id} className="rounded-lg border border-slate-200 bg-slate-50 p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-lg font-semibold text-slate-950">{ticket.subject}</div>
                  <div className="mt-2 text-sm leading-7 text-slate-500">{ticket.lastMessage}</div>
                </div>
                <div className="text-sm font-semibold text-slate-500">{formatTicketStatus(ticket.status)}</div>
              </div>
              <div className="mt-4 text-sm text-slate-400">Обновлено {formatDateTime(ticket.updatedAt)}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

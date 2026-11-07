import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { unstable_noStore as noStore } from "next/cache";
import { CreateProjectForm } from "@/components/create-project-form";
import { requireMarketplaceUser } from "@/lib/auth";
import {
  getProjectFormConfig,
  getProjectPlatformLabel,
  getProjectServiceLabel,
  getWalletOverview,
  listProjectTasks,
  type ProjectTaskStatus,
} from "@/lib/db";
import {
  formatCurrency,
  formatDateTime,
  formatProjectTaskStatus,
  getProjectTaskStatusTone,
} from "@/lib/utils";

type ProjectsPageProps = {
  searchParams?: Promise<{
    status?: ProjectTaskStatus | "ALL";
    scope?: "ALL" | "MINE";
  }>;
};

export default async function ProjectsPage({ searchParams }: ProjectsPageProps) {
  noStore();

  const user = await requireMarketplaceUser();
  const filters = (await searchParams) ?? {};
  const status = filters.status ?? "ALL";
  const scope = filters.scope ?? "ALL";
  const projects = (await listProjectTasks({
    status,
    mineUserId: scope === "MINE" ? user.id : undefined,
  }));
  const wallet = (await getWalletOverview(user.id));
  const projectFormConfig = (await getProjectFormConfig());

  return (
    <div className="space-y-6">
      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/60 sm:p-8">
            <div className="text-sm font-semibold  text-slate-400">Сервисы</div>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950 sm:text-3xl">Объявление от проекта</h1>
            <div className="mt-4 text-sm leading-7 text-slate-500">
            Размести задачу для Telegram, YouTube, TikTok, Instagram, VK, Discord или Twitch. Бюджет резервируется с баланса сразу,
            прогресс считается по списку ссылок, каналов, чатов или usernames.
          </div>
          <div className="mt-6 rounded-lg bg-slate-50 p-5">
            <div className="text-sm font-semibold  text-slate-400">Доступный баланс</div>
            <div className="mt-2 text-3xl font-semibold text-slate-950">
              {formatCurrency(wallet.availableRub, user.preferredCurrency)}
            </div>
            <Link href="/wallet" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-green-700">
              Пополнить криптой
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/60 sm:p-8">
          <CreateProjectForm preferredCurrency={user.preferredCurrency} config={projectFormConfig} />
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/60 sm:p-8">
        <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-sm font-semibold  text-slate-400">Задачи</div>
            <h2 className="mt-2 text-3xl font-semibold text-slate-950">Задачи по сервисам</h2>
          </div>
          <form action="/market/projects" className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <select
              name="status"
              defaultValue={status}
              className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-slate-300"
            >
              <option value="ALL">Все статусы</option>
              <option value="OPEN">Открытые</option>
              <option value="IN_PROGRESS">В работе</option>
              <option value="COMPLETED">Завершённые</option>
              <option value="CANCELLED">Отменённые</option>
            </select>
            <select
              name="scope"
              defaultValue={scope}
              className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-slate-300"
            >
              <option value="ALL">Все задачи</option>
              <option value="MINE">Мои задачи</option>
            </select>
            <button type="submit" className="rounded-lg bg-green-600 px-5 py-3 font-semibold text-white hover:bg-green-500">
              Показать
            </button>
          </form>
        </div>

        <div className="mt-6 grid gap-4">
          {projects.map(async (project) => {
            const progress = Math.round((project.completedCount / Math.max(1, project.targetCount)) * 100);

            return (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="block rounded-lg border border-slate-200 p-5 hover:border-slate-300 hover:bg-slate-50"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className={`font-semibold ${getProjectTaskStatusTone(project.status)}`}>
                        {formatProjectTaskStatus(project.status)}
                      </span>
                      <span className="text-slate-300">/</span>
                      <span className="text-slate-500">{(await getProjectPlatformLabel(project.platform))}</span>
                      <span className="text-slate-300">/</span>
                      <span className="text-slate-500">{(await getProjectServiceLabel(project.serviceType))}</span>
                    </div>
                    <div className="mt-2 text-xl font-semibold text-slate-950">{project.title}</div>
                    <div className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">{project.description}</div>
                    <div className="mt-4 flex flex-wrap gap-2 text-sm text-slate-500">
                      <span>{project.targetCount} целей</span>
                      <span>{project.customer.name}</span>
                      <span>{formatDateTime(project.createdAt)}</span>
                    </div>
                  </div>
                  <div className="w-full shrink-0 lg:w-56 lg:text-right">
                    <div className="text-2xl font-semibold text-slate-950">
                      {formatCurrency(project.totalBudgetRub, user.preferredCurrency)}
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-md bg-slate-100">
                      <div className="h-full rounded-md bg-green-600" style={{ width: `${progress}%` }} />
                    </div>
                    <div className="mt-2 text-sm text-slate-500">
                      {project.completedCount}/{project.targetCount}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}

          {!projects.length ? (
            <div className="rounded-lg bg-slate-50 p-8 text-center text-slate-500">Подходящих задач пока нет.</div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { acceptProjectAction } from "@/app/actions";
import { ProjectTaskControls } from "@/components/project-task-controls";
import { requireMarketplaceUser } from "@/lib/auth";
import { getProjectPlatformLabel, getProjectServiceLabel, getProjectTaskById } from "@/lib/db";
import {
  formatCurrency,
  formatDateTime,
  formatProjectTaskStatus,
  getProjectTaskStatusTone,
} from "@/lib/utils";

type ProjectPageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function ProjectPage({ params }: ProjectPageProps) {
  noStore();

  const user = await requireMarketplaceUser();
  const { projectId } = await params;
  const project = (await getProjectTaskById(projectId));

  if (!project) {
    notFound();
  }

  const isCustomer = project.customerId === user.id;
  const isExecutor = project.executorId === user.id;
  const canAccept = project.status === "OPEN" && !isCustomer;
  const canUpdateProgress = project.status === "IN_PROGRESS" && isExecutor;
  const canComplete = project.status === "IN_PROGRESS" && isCustomer;
  const progress = Math.round((project.completedCount / Math.max(1, project.targetCount)) * 100);

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/60 sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <Link href="/projects" className="text-sm font-semibold text-green-700">
              Назад к задачам
            </Link>
            <div className="mt-5 flex flex-wrap items-center gap-2 text-sm">
              <span className={`font-semibold ${getProjectTaskStatusTone(project.status)}`}>
                {formatProjectTaskStatus(project.status)}
              </span>
              <span className="text-slate-300">/</span>
              <span className="text-slate-500">{(await getProjectPlatformLabel(project.platform))}</span>
              <span className="text-slate-300">/</span>
              <span className="text-slate-500">{(await getProjectServiceLabel(project.serviceType))}</span>
            </div>
            <h1 className="mt-3 text-3xl font-semibold leading-tight text-slate-950 sm:text-3xl">{project.title}</h1>
            <div className="mt-4 max-w-3xl whitespace-pre-line text-sm leading-7 text-slate-500">{project.description}</div>
            {project.messageText ? (
              <div className="mt-5 max-w-3xl rounded-lg bg-slate-50 p-4">
                <div className="text-sm font-semibold  text-slate-400">Текст для выполнения</div>
                <div className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-700">{project.messageText}</div>
              </div>
            ) : null}
          </div>

          <div className="w-full shrink-0 rounded-lg bg-slate-50 p-5 lg:w-80">
            <div className="text-sm font-semibold  text-slate-400">Бюджет</div>
            <div className="mt-2 text-3xl font-semibold text-slate-950">
              {formatCurrency(project.totalBudgetRub, user.preferredCurrency)}
            </div>
            <div className="mt-2 text-sm text-slate-500">
              {formatCurrency(project.rewardPerTargetRub, user.preferredCurrency)} за цель
            </div>
            <div className="mt-5 h-2 overflow-hidden rounded-md bg-white">
              <div className="h-full rounded-md bg-green-600" style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-2 text-sm text-slate-500">
              {project.completedCount}/{project.targetCount} целей
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-6">
          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/60">
            <div className="text-sm font-semibold  text-slate-400">Участники</div>
            <div className="mt-5 grid gap-4">
              <div className="rounded-lg bg-slate-50 p-4">
                <div className="text-sm text-slate-500">Заказчик</div>
                <div className="mt-1 text-xl font-semibold text-slate-950">{project.customer.name}</div>
              </div>
              <div className="rounded-lg bg-slate-50 p-4">
                <div className="text-sm text-slate-500">Исполнитель</div>
                <div className="mt-1 text-xl font-semibold text-slate-950">{project.executor?.name ?? "Не назначен"}</div>
              </div>
            </div>
            <div className="mt-5 text-sm text-slate-500">Создано: {formatDateTime(project.createdAt)}</div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/60">
            <div className="text-sm font-semibold  text-slate-400">Источник</div>
            <div className="mt-3 text-xl font-semibold text-slate-950">{project.targetSource}</div>
            <div className="mt-3 text-sm leading-6 text-slate-500">
              По этим ссылкам, каналам, чатам или usernames исполнитель обновляет прогресс. Поддержка доступна через общий раздел.
            </div>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              {project.conversationId && (isCustomer || isExecutor) ? (
                <Link
                  href={`/chats/${project.conversationId}`}
                  className="rounded-lg bg-green-600 px-5 py-3 text-center text-sm font-semibold text-white hover:bg-green-500"
                >
                  Открыть чат
                </Link>
              ) : null}
              <Link
                href="/support"
                className="rounded-lg border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Поддержка
              </Link>
            </div>
          </div>

          {canAccept ? (
            <form action={acceptProjectAction} className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/60">
              <input type="hidden" name="projectId" value={project.id} />
              <div className="text-xl font-semibold text-slate-950">Взять задачу в работу</div>
              <div className="mt-2 text-sm leading-6 text-slate-500">
                После принятия будет создан заказ и чат с заказчиком. Выплата поступит после подтверждения выполнения.
              </div>
              <button type="submit" className="mt-5 w-full rounded-lg bg-green-600 px-5 py-3 font-semibold text-white hover:bg-green-500">
                Принять задачу
              </button>
            </form>
          ) : null}
        </div>

        <div className="space-y-6">
          <ProjectTaskControls
            projectId={project.id}
            targetCount={project.targetCount}
            completedCount={project.completedCount}
            canUpdateProgress={canUpdateProgress}
            canComplete={canComplete}
          />

          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/60">
            <div className="text-sm font-semibold  text-slate-400">Цели</div>
            <div className="mt-5 grid max-h-[520px] gap-2 overflow-y-auto pr-1">
              {project.targets.map((target, index) => (
                <div key={`${target}-${index}`} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-4 py-3">
                  <span className="min-w-0 truncate text-sm font-medium text-slate-700">{target}</span>
                  <span className="text-xs font-semibold text-slate-400">#{index + 1}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

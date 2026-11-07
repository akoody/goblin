"use client";

import { useActionState } from "react";
import { completeProjectAction, type FormState, updateProjectProgressAction } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";

const initialState: FormState = {};

type ProjectTaskControlsProps = {
  projectId: string;
  targetCount: number;
  completedCount: number;
  canUpdateProgress: boolean;
  canComplete: boolean;
};

export function ProjectTaskControls({
  projectId,
  targetCount,
  completedCount,
  canUpdateProgress,
  canComplete,
}: ProjectTaskControlsProps) {
  const [progressState, progressFormAction] = useActionState(updateProjectProgressAction, initialState);
  const [completeState, completeFormAction] = useActionState(completeProjectAction, initialState);

  if (!canUpdateProgress && !canComplete) {
    return null;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {canUpdateProgress ? (
        <form action={progressFormAction} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60">
          <input type="hidden" name="projectId" value={projectId} />
          <div className="text-sm font-semibold  text-slate-400">Прогресс</div>
          <label className="mt-4 flex flex-col gap-2">
            <span className="text-sm font-medium text-slate-700">Выполнено целей из {targetCount}</span>
            <input
              name="completedCount"
              type="number"
              min={0}
              max={targetCount}
              defaultValue={completedCount}
              className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-base outline-none focus:border-slate-300"
            />
          </label>
          {progressState.error ? <div className="mt-3 text-sm text-rose-600">{progressState.error}</div> : null}
          {progressState.success ? <div className="mt-3 text-sm text-emerald-600">{progressState.success}</div> : null}
          <SubmitButton className="mt-4 w-full">Обновить прогресс</SubmitButton>
        </form>
      ) : null}

      {canComplete ? (
        <form action={completeFormAction} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60">
          <input type="hidden" name="projectId" value={projectId} />
          <div className="text-sm font-semibold  text-slate-400">Выплата</div>
          <div className="mt-4 text-sm leading-6 text-slate-500">
            Подтверждение закроет задачу и отправит зарезервированную сумму исполнителю.
          </div>
          {completeState.error ? <div className="mt-3 text-sm text-rose-600">{completeState.error}</div> : null}
          {completeState.success ? <div className="mt-3 text-sm text-emerald-600">{completeState.success}</div> : null}
          <SubmitButton className="mt-4 w-full">Подтвердить выполнение</SubmitButton>
        </form>
      ) : null}
    </div>
  );
}

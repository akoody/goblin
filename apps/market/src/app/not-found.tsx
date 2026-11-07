import Link from "next/link";
import { Compass, Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 items-center px-6 py-16">
      <div className="w-full rounded-lg border border-white/10 bg-slate-900/80 p-10 text-center shadow-sm shadow-black/20">
        <div className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-lg bg-emerald-400/12 text-emerald-300">
          <Compass className="h-7 w-7" />
        </div>
        <div className="mt-6 text-sm font-semibold  text-emerald-300">Ошибка 404</div>
        <h1 className="mt-3 text-3xl font-semibold text-white">Страница не найдена</h1>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-slate-400">
          Возможно, ссылка устарела, проект был удалён или у тебя нет доступа к этому диалогу. Вернись на главную
          или открой биржу, чтобы продолжить работу.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
          >
            <Home className="h-4 w-4" />
            На главную
          </Link>
          <Link
            href="/projects"
            className="inline-flex items-center justify-center rounded-lg border border-white/10 px-5 py-3 text-sm font-semibold text-slate-100 transition hover:border-white/20 hover:bg-white/5"
          >
            Открыть биржу
          </Link>
        </div>
      </div>
    </div>
  );
}

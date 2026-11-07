import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { catalogKindLabels } from "@/lib/constants";
import { getCatalogLibrary } from "@/lib/db";
import {marketArea, selectedMarketArea} from '@/lib/market-area';

type HomePageProps = {
  searchParams?: Promise<{
    q?: string;
    part?: string;
    access?: string;
  }>;
};

function groupByLetter(items: Awaited<Awaited<ReturnType<typeof getCatalogLibrary>>>) {
  const groups = new Map<string, typeof items>();

  items.forEach((item) => {
    const letter = item.name[0]?.toUpperCase() ?? "#";
    const nextItems = groups.get(letter) ?? [];
    nextItems.push(item);
    groups.set(letter, nextItems);
  });

  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, "ru"));
}

export default async function HomePage({ searchParams }: HomePageProps) {
  noStore();

  const resolvedSearchParams = (await searchParams) ?? {};
  const query = resolvedSearchParams.q?.trim() ?? "";
  const allItems = await getCatalogLibrary(query);
  const part = resolvedSearchParams.part ? selectedMarketArea(resolvedSearchParams.part) : allItems.some(item=>item.sectionStats.some(section=>marketArea(section)==='accounts'))?'accounts':'services';
  const library = allItems.map(item => ({...item,sectionStats:item.sectionStats.filter(section => marketArea(section) === part)})).filter(item => item.sectionStats.length);
  const grouped = groupByLetter(library);

  return (
    <section className="min-w-0 bg-transparent sm:rounded-lg sm:border sm:border-slate-200 sm:bg-white/92 sm:p-8 sm:shadow-sm sm:shadow-slate-200/60">
      {resolvedSearchParams.access==='restricted'&&<p role="status" className="mb-4 text-sm text-slate-600">Доступ к этому разделу отключён администратором. Открытые заказы и чаты остаются доступны.</p>}
      <nav aria-label="Разделы маркета" className="mb-6 flex gap-6 border-b border-slate-200">
        {(['accounts','services'] as const).map(value => <Link key={value} href={`/?part=${value}${query?`&q=${encodeURIComponent(query)}`:''}`} aria-current={part===value?'page':undefined} className={`border-b-2 px-1 py-3 font-semibold ${part===value?'border-green-700 text-green-800':'border-transparent text-slate-500'}`}>{value==='accounts'?'Аккаунты':'Услуги'}</Link>)}
      </nav>
      <form action="/market" className="mb-5 flex min-w-0 gap-2">
        <input type="hidden" name="part" value={part}/>
        <input aria-label="Поиск в разделе маркета" type="search" name="q" defaultValue={query} placeholder="Игра, сервис или платформа" maxLength={160} className="min-w-0 flex-1 rounded-md border border-slate-200 p-3"/>
        <button type="submit" className="rounded-md border border-slate-200 px-4 py-2">Найти</button>
      </form>
      <div className="mb-5 flex min-w-0 flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="mt-2 text-[1.7rem] font-semibold leading-tight text-slate-950 sm:text-3xl">
            {query ? `Результаты поиска по запросу «${query}»` : part==='accounts'?'Маркет аккаунтов':'Маркет услуг'}
          </h1>
        </div>
        <div className="text-sm text-slate-500">{library.length} найденных разделов</div>
      </div>

      {!library.length&&<p role="status" className="py-6 text-sm text-slate-600">Нет доступных категорий по выбранным условиям. Попробуйте другой раздел или измените поиск.</p>}

      <div className="grid min-w-0 gap-5 xl:grid-cols-[96px_1fr] xl:gap-8">
        <div className="hidden xl:block">
          <div className="sticky top-28 flex flex-col gap-2">
            {grouped.map(([letter]) => (
              <a
                key={letter}
                href={`#section-${letter}`}
                className="text-sm font-semibold text-green-600 hover:text-green-700"
              >
                {letter}
              </a>
            ))}
          </div>
        </div>

        <div className="min-w-0 space-y-6 sm:space-y-8">
          <div className="flex w-full max-w-full gap-2 overflow-x-auto pb-1 xl:hidden">
            {grouped.map(([letter]) => (
              <a
                key={letter}
                href={`#section-${letter}`}
                className="shrink-0 rounded-md bg-slate-100 px-3 py-1.5 text-sm font-semibold text-green-700"
              >
                {letter}
              </a>
            ))}
          </div>

          {grouped.map(([letter, items]) => (
            <section key={letter} id={`section-${letter}`} className="min-w-0 scroll-mt-28">
              <div className="mb-3 text-lg font-semibold text-slate-400 sm:mb-4 sm:text-xl">{letter}</div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {items.map((item) => (
                  <Link
                    key={item.id}
                    href={`/catalog/${item.slug}?part=${part}`}
                    className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm shadow-slate-200/50  hover:border-slate-300 sm:rounded-lg"
                  >
                    <div
                      className="h-1"
                      style={{
                        background: item.themeFrom,
                      }}
                    />
                    <div className="min-w-0 p-4 sm:p-5">
                      <div className="truncate text-base font-semibold text-slate-950 sm:text-lg">{item.name}</div>
                      <div className="mt-1 text-sm text-slate-500">
                        {catalogKindLabels[item.kind]} · {item.sectionStats.reduce((total,section)=>total+section.listingsCount,0)} предложений
                      </div>
                      <div className="mt-3 line-clamp-2 text-sm leading-6 text-slate-500">{item.description}</div>
                      <div className="mt-4 flex max-w-full flex-wrap gap-2 overflow-hidden">
                        {item.sectionStats.slice(0, 4).map((section) => (
                          <span key={section.id} className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                            {section.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </section>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, Search } from "lucide-react";
import { unstable_noStore as noStore } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { isAdminUser } from "@/lib/admin";
import { catalogKindLabels } from "@/lib/constants";
import { getCatalogItemBySlug } from "@/lib/db";
import { getCatalogSectionPath, getListingPath, getSellSectionPath } from "@/lib/routes";
import { formatCurrency, formatDeliveryType, getInitials } from "@/lib/utils";
import {marketArea, selectedMarketArea} from '@/lib/market-area';

type CatalogPageProps = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{
    section?: string;
    q?: string;
    online?: string;
    part?: string;
  }>;
};

export default async function CatalogItemPage({ params, searchParams }: CatalogPageProps) {
  noStore();

  const { slug } = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  const user = await getCurrentUser();
  const admin = isAdminUser(user);
  const allDetails = (await getCatalogItemBySlug(slug, {
    section: resolvedSearchParams.section,
    query: resolvedSearchParams.q,
    onlineOnly: resolvedSearchParams.online === "1",
  }));

  if (!allDetails) {
    notFound();
  }
  const part = resolvedSearchParams.part ? selectedMarketArea(resolvedSearchParams.part) : allDetails.selectedSection ? marketArea(allDetails.selectedSection) : allDetails.sectionStats.some(section=>marketArea(section)==='accounts')?'accounts':'services';
  const sectionStats = allDetails.sectionStats.filter(section => marketArea(section)===part);
  if (!sectionStats.length || (allDetails.selectedSection && marketArea(allDetails.selectedSection)!==part)) notFound();
  const allowedSections = new Set(sectionStats.map(section=>section.id));
  const listings = allDetails.listings.filter(listing=>allowedSections.has(listing.sectionId));
  const details = {...allDetails,sectionStats,listings,listingCount:sectionStats.reduce((total,section)=>total+section.listingsCount,0)};
  const sectionPath = (sectionId?: string) => `${getCatalogSectionPath(details.slug,sectionId)}${sectionId?'&':'?'}part=${part}`;

  return (
    <div className="grid min-w-0 gap-5 xl:grid-cols-[1.08fr_0.92fr] xl:gap-6">
      <section className="min-w-0 space-y-5 xl:space-y-6">
        <div className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm shadow-slate-200/60 sm:rounded-lg">
          <div
            className="h-1"
            style={{
              background: details.themeFrom,
            }}
          />
          <div className="grid gap-6 p-5 sm:p-8">
            <div>
              <Link href={`/?part=${part}`} className="inline-flex items-center gap-2 text-sm font-semibold text-green-700 hover:text-green-800">
                <ArrowLeft className="h-4 w-4" />
                Назад к библиотеке
              </Link>
              <div className="mt-5 inline-flex rounded-md bg-slate-100 px-3 py-1 text-xs font-semibold  text-slate-500">
                {catalogKindLabels[details.kind]}
              </div>
              <h1 className="mt-4 font-(family-name:--font-space-grotesk) text-3xl font-bold text-slate-950 sm:text-3xl">
                {details.name}
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-500 sm:text-base sm:leading-8">{details.description}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-slate-50 p-4">
                <div className="text-sm text-slate-500">Подкатегорий</div>
                <div className="mt-2 text-2xl font-semibold text-slate-950">{details.sectionStats.length}</div>
              </div>
              <div className="rounded-lg bg-slate-50 p-4">
                <div className="text-sm text-slate-500">Активных офферов</div>
                <div className="mt-2 text-2xl font-semibold text-slate-950">{details.listingCount}</div>
              </div>
              <div className="rounded-lg bg-slate-50 p-4">
                <div className="text-sm text-slate-500">Статус</div>
                <div className="mt-2 text-2xl font-semibold text-emerald-600">Открыт</div>
              </div>
            </div>
          </div>
        </div>

        <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/60 sm:rounded-lg sm:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex w-full max-w-full gap-2 overflow-x-auto pb-1 lg:flex-wrap lg:overflow-visible">
              <Link
                href={sectionPath()}
                className={`shrink-0 rounded-md px-4 py-2 text-sm font-semibold ${
                  !resolvedSearchParams.section ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                Все разделы
              </Link>
              {details.sectionStats.map((section) => (
                <Link
                  key={section.id}
                  href={sectionPath(section.id)}
                  className={`shrink-0 rounded-md px-4 py-2 text-sm font-semibold ${
                    resolvedSearchParams.section === section.id
                      ? "bg-slate-950 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {section.name} · {section.listingsCount}
                </Link>
              ))}
            </div>

            {user && !admin ? (
              <Link
                href={getSellSectionPath(details.slug, details.selectedSection?.id ?? details.sectionStats[0]?.id ?? "")}
                className="w-full shrink-0 rounded-lg border border-green-200 bg-green-50 px-5 py-3 text-center text-sm font-semibold text-green-700 hover:border-green-300 hover:bg-green-100 lg:w-auto"
              >
                {details.selectedSection ? `Продать в разделе «${details.selectedSection.name}»` : "Выбрать раздел и продать"}
              </Link>
            ) : !user ? (
              <Link
                href="/login"
                className="w-full shrink-0 rounded-lg border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-600 hover:bg-slate-50 lg:w-auto"
              >
                Войти, чтобы продавать
              </Link>
            ) : null}
          </div>

          <form action={`/catalog/${details.slug}`} className="mt-5 grid min-w-0 gap-3 lg:grid-cols-[1fr_240px_160px]">
            <input type="hidden" name="part" value={part}/>
            <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                type="search"
                name="q"
                defaultValue={resolvedSearchParams.q}
                placeholder="Поиск по описанию"
                className="w-full bg-transparent outline-none placeholder:text-slate-400"
              />
            </label>
            <label className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600">
              <span>Только продавцы онлайн</span>
              <input type="checkbox" name="online" value="1" defaultChecked={resolvedSearchParams.online === "1"} />
            </label>
            {resolvedSearchParams.section ? <input type="hidden" name="section" value={resolvedSearchParams.section} /> : null}
            <button type="submit" className="rounded-lg bg-green-600 px-5 py-3 text-sm font-semibold text-white hover:bg-green-500">
              Показать
            </button>
          </form>

          {!details.selectedSection ? (
            <div className="mt-4 text-sm text-slate-500">
              Для публикации собственного предложения сначала выберите нужную подкатегорию.
            </div>
          ) : null}
        </div>
      </section>

      <aside className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/60 sm:rounded-lg sm:p-8">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold  text-slate-400">Офферы</div>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950">{details.listings.length} предложений</h2>
          </div>
          {user ? (
            <Link href="/sales" className="rounded-md border border-slate-200 px-4 py-2 text-center text-sm font-semibold text-slate-600 hover:bg-slate-50">
              Мои продажи
            </Link>
          ) : (
            <Link href="/register" className="rounded-md border border-slate-200 px-4 py-2 text-center text-sm font-semibold text-slate-600 hover:bg-slate-50">
              Стать продавцом
            </Link>
          )}
        </div>

        <div className="space-y-4">
          {details.listings.map((listing) => (
            <Link
              key={listing.id}
              href={getListingPath(details.slug, listing.id)}
              className="block min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-4 hover:border-green-200 hover:bg-white hover:shadow-sm hover:shadow-green-100 sm:rounded-lg sm:p-5"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex gap-3">
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-md bg-emerald-50 text-sm font-bold text-green-700">
                    {getInitials(listing.seller.name)}
                  </span>
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-950">{listing.seller.name}</div>
                    <div className="mt-1 text-sm text-slate-500">
                      ★ {listing.rating.toFixed(1)} · {listing.reviewsCount} отзывов · на сайте {listing.yearsOnPlatform} г
                    </div>
                  </div>
                </div>
                <div className="flex items-end justify-between gap-3 sm:block sm:text-right">
                  <div className="text-xl font-semibold text-slate-950 sm:text-2xl">
                    {formatCurrency(listing.priceRub, user?.preferredCurrency ?? "RUB")}
                  </div>
                  <div className="mt-1 text-sm text-slate-500">{formatDeliveryType(listing.deliveryType)}</div>
                </div>
              </div>
              <div className="mt-4 text-base font-semibold text-slate-950 sm:text-lg">{listing.title}</div>
              <div className="mt-2 text-sm leading-7 text-slate-500">{listing.description}</div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-2 rounded-md bg-white px-3 py-1.5 text-sm font-medium text-slate-600">
                  <CheckCircle2 className={`h-4 w-4 ${listing.isOnline ? "text-emerald-500" : "text-slate-300"}`} />
                  {listing.isOnline ? "Продавец онлайн" : "Ответит позже"}
                </span>
                <span className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-slate-600">{listing.section.name}</span>
              </div>
            </Link>
          ))}
        </div>
      </aside>
    </div>
  );
}

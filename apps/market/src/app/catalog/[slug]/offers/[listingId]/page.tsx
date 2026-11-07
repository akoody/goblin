import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, MessageCircle, ShieldCheck, Star } from "lucide-react";
import { unstable_noStore as noStore } from "next/cache";
import { PurchaseForm } from "@/components/purchase-form";
import { getCurrentUser } from "@/lib/auth";
import { isAdminUser } from "@/lib/admin";
import { getListingDetails } from "@/lib/db";
import { getCatalogSectionPath } from "@/lib/routes";
import { formatCurrency, formatDeliveryType, getInitials } from "@/lib/utils";

type ListingPageProps = {
  params: Promise<{
    slug: string;
    listingId: string;
  }>;
};

export default async function ListingPage({ params }: ListingPageProps) {
  noStore();

  const { slug, listingId } = await params;
  const user = await getCurrentUser();
  const admin = isAdminUser(user);
  const listing = (await getListingDetails(slug, listingId));

  if (!listing) {
    notFound();
  }

  const preferredCurrency = user?.preferredCurrency ?? "RUB";
  const isOwnListing = user?.id === listing.sellerId;
  const canBuy = Boolean(user && !admin && !isOwnListing);

  return (
    <div className="grid min-w-0 gap-5 xl:grid-cols-[1fr_420px] xl:gap-6">
      <section className="min-w-0 space-y-5">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60 sm:rounded-lg sm:p-8">
          <Link
            href={getCatalogSectionPath(listing.item.slug, listing.sectionId)}
            className="inline-flex items-center gap-2 text-sm font-semibold text-green-700 hover:text-green-800"
          >
            <ArrowLeft className="h-4 w-4" />
            К списку предложений
          </Link>

          <div className="mt-6">
            <div className="text-sm font-semibold  text-slate-400">
              {listing.item.name} · {listing.section.name}
            </div>
            <h1 className="mt-3 text-3xl font-semibold leading-tight text-slate-950 sm:text-3xl">{listing.title}</h1>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                {listing.status === "ACTIVE" ? "Активно" : "На паузе"}
              </span>
              <span className="rounded-md bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-600">
                {formatDeliveryType(listing.deliveryType)}
              </span>
              {listing.isOnline ? (
                <span className="rounded-md bg-green-50 px-3 py-1.5 text-sm font-semibold text-green-700">Продавец онлайн</span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60 sm:rounded-lg sm:p-8">
          <div className="text-sm font-semibold  text-slate-400">Описание</div>
          <div className="mt-4 whitespace-pre-line text-base leading-8 text-slate-600">{listing.description}</div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60">
            <div className="text-sm text-slate-500">Цена за 1 шт.</div>
            <div className="mt-2 text-2xl font-semibold text-slate-950">{formatCurrency(listing.priceRub, preferredCurrency)}</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60">
            <div className="text-sm text-slate-500">Рейтинг</div>
            <div className="mt-2 flex items-center gap-2 text-2xl font-semibold text-slate-950">
              {listing.rating.toFixed(1)}
              <Star className="h-5 w-5 fill-yellow-300 text-yellow-300" />
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60">
            <div className="text-sm text-slate-500">Отзывы</div>
            <div className="mt-2 text-2xl font-semibold text-slate-950">{listing.reviewsCount}</div>
          </div>
        </div>

        {listing.deliveryNote ? (
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60 sm:rounded-lg sm:p-8">
            <div className="text-sm font-semibold  text-slate-400">После оплаты</div>
            <div className="mt-4 whitespace-pre-line text-base leading-8 text-slate-600">{listing.deliveryNote}</div>
          </div>
        ) : null}
      </section>

      <aside className="min-w-0 space-y-5 xl:sticky xl:top-28 xl:self-start">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60 sm:rounded-lg sm:p-6">
          <div className="flex items-start gap-4">
            <span className="inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-lg font-bold text-green-700">
              {getInitials(listing.seller.name)}
            </span>
            <div className="min-w-0">
              <div className="truncate text-2xl font-semibold text-slate-950">{listing.seller.name}</div>
              <div className="mt-1 text-sm font-semibold text-emerald-600">{listing.isOnline ? "онлайн" : "ответит позже"}</div>
              <div className="mt-2 text-sm text-slate-500">
                ★ {listing.rating.toFixed(1)} · {listing.reviewsCount} отзывов · {listing.yearsOnPlatform} г на сайте
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-500">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-green-600" />
              Чат с продавцом откроется после оформления заказа.
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60 sm:rounded-lg sm:p-6">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-500">
            <ShieldCheck className="h-5 w-5 text-green-600" />
            Оплата резервируется до завершения заказа.
          </div>

          {canBuy ? (
            <PurchaseForm listingId={listing.id} priceRub={listing.priceRub} preferredCurrency={preferredCurrency} />
          ) : user ? (
            <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-500">
              {isOwnListing ? "Это твоё предложение. Покупка собственного оффера недоступна." : "Администратор не может оформлять покупки."}
            </div>
          ) : (
            <Link
              href="/login"
              className="block rounded-lg bg-green-600 px-5 py-3 text-center text-sm font-semibold text-white hover:bg-green-500"
            >
              Войти, чтобы купить
            </Link>
          )}
        </div>
      </aside>
    </div>
  );
}

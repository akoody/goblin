import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { unstable_noStore as noStore } from "next/cache";
import { CreateListingForm } from "@/components/create-listing-form";
import { requireMarketplaceUser } from "@/lib/auth";
import { getCatalogItemBySlug } from "@/lib/db";
import { getCatalogSectionPath } from "@/lib/routes";

type SellPageProps = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{
    section?: string;
  }>;
};

export default async function SellListingPage({ params, searchParams }: SellPageProps) {
  noStore();

  const user = await requireMarketplaceUser();
  const { slug } = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  const details = (await getCatalogItemBySlug(slug, {
    section: resolvedSearchParams.section,
  }));

  if (!details) {
    notFound();
  }

  const targetSection = details.selectedSection ?? details.sectionStats[0] ?? null;

  if (!targetSection) {
    notFound();
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/60 sm:p-8">
        <Link
          href={getCatalogSectionPath(details.slug, targetSection.id)}
          className="inline-flex items-center gap-2 text-sm font-semibold text-green-700 hover:text-green-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Назад в раздел
        </Link>
        <div className="mt-6">
          <div className="text-sm font-semibold  text-slate-400">Продажа</div>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950 sm:text-3xl">Добавление предложения</h1>
          <p className="mt-4 text-sm leading-7 text-slate-500 sm:text-base sm:leading-8">
            Вы добавляете оффер в раздел <span className="font-semibold text-slate-900">{details.name}</span> →{" "}
            <span className="font-semibold text-slate-900">{targetSection.name}</span>. После сохранения предложение
            сразу появится в витрине.
          </p>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/60 sm:p-8">
        <CreateListingForm
          itemSlug={details.slug}
          itemName={details.name}
          sectionId={targetSection.id}
          sectionName={targetSection.name}
          preferredCurrency={user.preferredCurrency}
        />
      </section>
    </div>
  );
}

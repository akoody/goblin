export function getCatalogSectionPath(itemSlug: string, sectionId?: string | null) {
  if (!sectionId) {
    return `/catalog/${encodeURIComponent(itemSlug)}`;
  }

  const params = new URLSearchParams({ section: sectionId });
  return `/catalog/${encodeURIComponent(itemSlug)}?${params.toString()}`;
}

export function getSellSectionPath(itemSlug: string, sectionId: string) {
  const params = new URLSearchParams({ section: sectionId });
  return `/catalog/${encodeURIComponent(itemSlug)}/sell?${params.toString()}`;
}

export function getListingPath(itemSlug: string, listingId: string) {
  return `/catalog/${encodeURIComponent(itemSlug)}/offers/${encodeURIComponent(listingId)}`;
}

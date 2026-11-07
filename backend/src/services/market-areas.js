import {db} from '../config/db.js';

export async function assertUserMarketArea(userId, section, executor = db) {
  const [[user]] = await executor.execute('SELECT market_accounts_enabled,market_services_enabled FROM users WHERE id=?', [userId]);
  if (!user) throw Object.assign(new Error('USER_NOT_FOUND'), {status:404});
  assertMarketArea(user, {name:section});
}

export function marketArea(section) {
  return /^(аккаунт[ыа]?|accounts?)$/i.test(String(section?.name || '').trim()) ? 'accounts' : 'services';
}

export function marketAreaAllowed(user, section) {
  if (!user) return true;
  const key = marketArea(section) === 'accounts' ? 'market_accounts_enabled' : 'market_services_enabled';
  return Number(user[key]) === 1;
}

export function assertMarketArea(user, section) {
  if (!section) throw Object.assign(new Error('SECTION_NOT_FOUND'), { status: 404 });
  if (!marketAreaAllowed(user, section)) throw Object.assign(new Error('MARKET_SECTION_DISABLED'), { status: 403 });
}

// Settlement and existing-order chats deliberately stay available after access
// revocation. A switch must stop new business, not strand an existing escrow.
export function restrictMarketResult(operation, result, user) {
  if (!result || !user) return result;
  const trimItem = item => {
    const allowed = new Set(item.sections.filter(s => marketAreaAllowed(user, s)).map(s => s.id));
    if (allowed.size === item.sections.length) return item;
    const sectionStats = item.sectionStats.filter(s => allowed.has(s.id));
    const listings = item.listings?.filter(l => allowed.has(l.sectionId));
    return { ...item, sections: item.sections.filter(s => allowed.has(s.id)), sectionStats,
      listingCount: sectionStats.reduce((n, s) => n + s.listingsCount, 0),
      // Do not show a price from a category the user cannot access.
      minPriceRub: null, ...(listings ? { listings } : {}) };
  };
  if (['getCatalogLibrary', 'getFeaturedCatalogItems'].includes(operation)) return result.map(trimItem).filter(i => i.sections.length);
  if (operation === 'getCatalogItemBySlug') {
    if (result.selectedSection) assertMarketArea(user, result.selectedSection);
    const item = trimItem(result);
    if (!item.sections.length) throw Object.assign(new Error('MARKET_SECTION_DISABLED'), { status: 403 });
    return item;
  }
  if (operation === 'getListingDetails') assertMarketArea(user, result.section);
  return result;
}

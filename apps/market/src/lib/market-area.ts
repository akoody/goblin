export type MarketArea = 'accounts' | 'services';
export const marketArea = (section: {name: string; area?: MarketArea}): MarketArea => section.area ?? (/^(аккаунт[ыа]?|accounts?)$/i.test(section.name.trim()) ? 'accounts' : 'services');
export const selectedMarketArea = (value?: string): MarketArea => value === 'services' ? 'services' : 'accounts';

export type LocationSearchResult = {
  id: number;
  name: string;
  country: string;
  admin1?: string;
  latitude: number;
  longitude: number;
  feature_code: string;
  population?: number;
};

export type ResolvedLocation = LocationSearchResult & { display: string };

const COUNTRY_ALIASES: Record<string, string> = {
  uk: 'United Kingdom',
  gb: 'United Kingdom',
  britain: 'United Kingdom',
  'great britain': 'United Kingdom',
  usa: 'United States',
  us: 'United States',
  'u.s.': 'United States',
  'u.s.a.': 'United States',
  uae: 'United Arab Emirates',
};

export function normalizeLocationQuery(query: string): string {
  const trimmed = query.trim();
  return COUNTRY_ALIASES[trimmed.toLocaleLowerCase()] ?? trimmed;
}

export function resolveLocationResults(
  results: LocationSearchResult[],
  query: string,
): ResolvedLocation[] {
  const normalizedQuery = normalizeLocationQuery(query).toLocaleLowerCase();
  return results
    .filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude))
    .sort((a, b) => {
      const exactA = a.name.toLocaleLowerCase() === normalizedQuery ? 1 : 0;
      const exactB = b.name.toLocaleLowerCase() === normalizedQuery ? 1 : 0;
      const placeA = a.feature_code.startsWith('PPL') ? 1 : 0;
      const placeB = b.feature_code.startsWith('PPL') ? 1 : 0;
      return exactB - exactA || placeB - placeA || (b.population ?? 0) - (a.population ?? 0);
    })
    .map((item) => ({
      ...item,
      display: item.feature_code.startsWith('PCL')
        ? item.name
        : [item.name, item.admin1, item.country].filter(Boolean).join(', '),
    }));
}

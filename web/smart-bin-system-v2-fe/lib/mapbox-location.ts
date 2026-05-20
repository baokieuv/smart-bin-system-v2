type MapboxReverseGeocodeFeature = {
  place_name?: string;
  text?: string;
  place_type?: string[];
  relevance?: number;
  properties?: {
    address?: string;
  };
};

const REVERSE_GEOCODE_TYPES = 'address,neighborhood,locality,place,district,postcode,region,country';
const locationLabelCache = new Map<string, string>();

const toCacheKey = (longitude: number, latitude: number) => `${longitude.toFixed(6)},${latitude.toFixed(6)}`;

const scoreFeature = (feature: MapboxReverseGeocodeFeature) => {
  const type = feature.place_type?.[0] ?? '';
  const priority: Record<string, number> = {
    address: 0,
    neighborhood: 1,
    locality: 2,
    place: 3,
    district: 4,
    postcode: 5,
    region: 6,
    country: 7,
  };

  return priority[type] ?? 100;
};

const pickBestLabel = (features: MapboxReverseGeocodeFeature[]) => {
  const sorted = [...features].sort((left, right) => {
    const scoreDelta = scoreFeature(left) - scoreFeature(right);
    if (scoreDelta !== 0) return scoreDelta;

    const relevanceDelta = (right.relevance ?? 0) - (left.relevance ?? 0);
    if (relevanceDelta !== 0) return relevanceDelta;

    return (left.place_name ?? '').length - (right.place_name ?? '').length;
  });

  return sorted[0]?.place_name?.trim() || sorted[0]?.text?.trim() || 'Unknown location';
};

export async function resolveMapboxLocationLabel(
  longitude: number,
  latitude: number,
): Promise<string> {
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    return 'Location unavailable';
  }

  const accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  if (!accessToken) {
    return 'Location available but Mapbox is not configured';
  }

  const cacheKey = toCacheKey(longitude, latitude);
  const cachedLabel = locationLabelCache.get(cacheKey);
  if (cachedLabel) {
    return cachedLabel;
  }

  const response = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(cacheKey)}.json?types=${REVERSE_GEOCODE_TYPES}&access_token=${accessToken}`,
  );

  if (!response.ok) {
    throw new Error('Failed to resolve location');
  }

  const data = (await response.json()) as { features?: MapboxReverseGeocodeFeature[] };
  const label = pickBestLabel(data.features ?? []);
  locationLabelCache.set(cacheKey, label);
  return label;
}

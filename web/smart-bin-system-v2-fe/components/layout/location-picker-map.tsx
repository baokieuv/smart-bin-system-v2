'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';

export type LocationValue = {
  latitude: number;
  longitude: number;
};

type LocationPickerMapProps = {
  value: LocationValue | null;
  onChange: (value: LocationValue) => void;
  className?: string;
  defaultCenter?: { lat: number; lng: number };
  defaultZoom?: number;
};

const FALLBACK_CENTER = {
  lat: 21.0285,
  lng: 105.8542,
};

export function LocationPickerMap({
  value,
  onChange,
  className,
  defaultCenter = FALLBACK_CENTER,
  defaultZoom = 11,
}: LocationPickerMapProps) {
  const accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  const [addressQuery, setAddressQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [helperMessage, setHelperMessage] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!accessToken || !containerRef.current || mapRef.current) return;

    mapboxgl.accessToken = accessToken;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [defaultCenter.lng, defaultCenter.lat],
      zoom: defaultZoom,
      attributionControl: false,
    });

    const setMarker = (longitude: number, latitude: number) => {
      if (!markerRef.current) {
        markerRef.current = new mapboxgl.Marker({ color: '#0f766e' })
          .setLngLat([longitude, latitude])
          .addTo(map);
      } else {
        markerRef.current.setLngLat([longitude, latitude]);
      }
    };

    map.on('click', (event) => {
      const longitude = Number(event.lngLat.lng.toFixed(6));
      const latitude = Number(event.lngLat.lat.toFixed(6));
      setMarker(longitude, latitude);
      onChangeRef.current({ latitude, longitude });
    });

    map.on('load', () => {
      map.resize();
    });

    requestAnimationFrame(() => {
      map.resize();
    });

    mapRef.current = map;

    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [accessToken, defaultCenter.lat, defaultCenter.lng, defaultZoom]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !value) return;

    if (!markerRef.current) {
      markerRef.current = new mapboxgl.Marker({ color: '#0f766e' })
        .setLngLat([value.longitude, value.latitude])
        .addTo(map);
    } else {
      markerRef.current.setLngLat([value.longitude, value.latitude]);
    }

    map.easeTo({ center: [value.longitude, value.latitude], duration: 350 });
  }, [value]);

  const applyLocation = (longitude: number, latitude: number) => {
    const map = mapRef.current;
    if (!map) return;

    if (!markerRef.current) {
      markerRef.current = new mapboxgl.Marker({ color: '#0f766e' })
        .setLngLat([longitude, latitude])
        .addTo(map);
    } else {
      markerRef.current.setLngLat([longitude, latitude]);
    }

    map.easeTo({ center: [longitude, latitude], zoom: Math.max(map.getZoom(), 14), duration: 450 });
    onChangeRef.current({ latitude, longitude });
  };

  const handleSearchAddress = async () => {
    const query = addressQuery.trim();
    if (!query || !accessToken) return;

    try {
      setIsSearching(true);
      setHelperMessage(null);

      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?limit=1&access_token=${accessToken}`,
      );
      if (!response.ok) {
        throw new Error('Address lookup failed');
      }

      const result = (await response.json()) as {
        features?: Array<{ center?: [number, number]; place_name?: string }>;
      };

      const firstFeature = result.features?.[0];
      const center = firstFeature?.center;
      if (!center || center.length < 2) {
        setHelperMessage('No matching address found. Please try another keyword.');
        return;
      }

      const longitude = Number(center[0].toFixed(6));
      const latitude = Number(center[1].toFixed(6));
      applyLocation(longitude, latitude);
      if (firstFeature?.place_name) {
        setHelperMessage(firstFeature.place_name);
      }
    } catch {
      setHelperMessage('Cannot search this address right now.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setHelperMessage('Geolocation is not supported by this browser.');
      return;
    }

    setIsLocating(true);
    setHelperMessage(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = Number(position.coords.latitude.toFixed(6));
        const longitude = Number(position.coords.longitude.toFixed(6));
        applyLocation(longitude, latitude);
        setHelperMessage('Using your current location.');
        setIsLocating(false);
      },
      () => {
        setHelperMessage('Cannot access your current location. Please allow location permission.');
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  if (!accessToken) {
    return (
      <div className={className ?? ''}>
        <div className="flex h-full w-full items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-center text-xs text-slate-600">
          Missing NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN.
        </div>
      </div>
    );
  }

  return (
    <div className={`${className ?? ''} relative overflow-hidden`}>
      <div className="pointer-events-none absolute left-2 right-2 top-2 z-10 space-y-2">
        <div className="pointer-events-auto flex items-center gap-2 rounded-lg bg-white/95 p-2 shadow">
          <input
            type="text"
            value={addressQuery}
            onChange={(event) => setAddressQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                handleSearchAddress();
              }
            }}
            placeholder="Search address (house number, street...)"
            className="h-8 flex-1 rounded-md border border-slate-300 px-2 text-xs text-slate-700 outline-none focus:border-emerald-500"
          />
          <button
            type="button"
            onClick={handleSearchAddress}
            disabled={isSearching || !addressQuery.trim()}
            className="h-8 rounded-md bg-emerald-600 px-2.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            title="Search address"
            aria-label="Search address"
          >
            {isSearching ? '...' : 'Find'}
          </button>
          <button
            type="button"
            onClick={handleUseCurrentLocation}
            disabled={isLocating}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed"
            title="Use current location"
            aria-label="Use current location"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v3m0 12v3m9-9h-3M6 12H3" />
              <circle cx="12" cy="12" r="4" />
            </svg>
          </button>
        </div>

        {helperMessage && (
          <div className="pointer-events-auto rounded-md bg-black/65 px-2 py-1 text-[11px] text-white">
            {helperMessage}
          </div>
        )}
      </div>

      <div ref={containerRef} className="h-full w-full rounded-xl" />
    </div>
  );
}

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useLanguage } from '@/lib/language'; // IMPORT HOOK NGÔN NGỮ

export type LocationValue = {
  latitude: number;
  longitude: number;
};

type AddressSuggestion = {
  id: string;
  placeName: string;
  longitude: number;
  latitude: number;
};

type LocationPickerMapProps = {
  value: LocationValue | null;
  onChange: (value: LocationValue) => void;
  className?: string;
  defaultCenter?: { lat: number; lng: number };
  defaultZoom?: number;
};

const FALLBACK_CENTER = {
  lat: 21.0056, 
  lng: 105.8434,
};

export function LocationPickerMap({
  value,
  onChange,
  className,
  defaultCenter = FALLBACK_CENTER,
  defaultZoom = 11,
}: LocationPickerMapProps) {
  const accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  const { t } = useLanguage(); // GỌI HOOK
  
  const [addressQuery, setAddressQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [helperMessage, setHelperMessage] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [isSuggestionListOpen, setIsSuggestionListOpen] = useState(false);
  const [highlightedSuggestionIndex, setHighlightedSuggestionIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const fetchAddressSuggestions = useCallback(async (query: string) => {
    if (!accessToken) return [] as AddressSuggestion[];

    const response = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?limit=3&access_token=${accessToken}`,
    );

    if (!response.ok) {
      throw new Error((t as any)('addressLookupFailed'));
    }

    const result = (await response.json()) as {
      features?: Array<{ id?: string; center?: [number, number]; place_name?: string }>;
    };

    return (result.features ?? [])
      .map((feature) => {
        const center = feature.center;
        if (!center || center.length < 2 || !feature.place_name) return null;

        return {
          id: feature.id ?? `${center[0]}-${center[1]}`,
          placeName: feature.place_name,
          longitude: Number(center[0].toFixed(6)),
          latitude: Number(center[1].toFixed(6)),
        } satisfies AddressSuggestion;
      })
      .filter((item): item is AddressSuggestion => item !== null)
      .slice(0, 3);
  }, [accessToken, t]);

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

  useEffect(() => {
    const query = addressQuery.trim();
    if (!query || !accessToken) {
      setSuggestions([]);
      setIsSearching(false);
      return;
    }

    if (query.length < 2) {
      setSuggestions([]);
      return;
    }

    const debounceId = window.setTimeout(async () => {
      try {
        setIsSearching(true);
        const nextSuggestions = await fetchAddressSuggestions(query);
        setSuggestions(nextSuggestions);
        setHighlightedSuggestionIndex(nextSuggestions.length > 0 ? 0 : -1);
      } catch {
        setSuggestions([]);
        setHighlightedSuggestionIndex(-1);
      } finally {
        setIsSearching(false);
      }
    }, 280);

    return () => {
      window.clearTimeout(debounceId);
    };
  }, [accessToken, addressQuery, fetchAddressSuggestions]);

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

  const selectSuggestion = (suggestion: AddressSuggestion) => {
    applyLocation(suggestion.longitude, suggestion.latitude);
    setAddressQuery(suggestion.placeName);
    setHelperMessage(suggestion.placeName);
    setSuggestions([]);
    setHighlightedSuggestionIndex(-1);
    setIsSuggestionListOpen(false);
    inputRef.current?.blur();
  };

  const handleSearchAddress = async () => {
    const query = addressQuery.trim();
    if (!query || !accessToken) return;

    try {
      setIsSearching(true);
      setHelperMessage(null);
      const mappedSuggestions = await fetchAddressSuggestions(query);

      if (mappedSuggestions.length === 0) {
        setSuggestions([]);
        setHighlightedSuggestionIndex(-1);
        setHelperMessage((t as any)('noMatchingAddress'));
        return;
      }

      setSuggestions(mappedSuggestions);
      setHighlightedSuggestionIndex(0);
      const firstSuggestion = mappedSuggestions[0];
      applyLocation(firstSuggestion.longitude, firstSuggestion.latitude);
      setHelperMessage(firstSuggestion.placeName);
    } catch {
      setSuggestions([]);
      setHighlightedSuggestionIndex(-1);
      setHelperMessage((t as any)('cannotSearchAddress'));
    } finally {
      setIsSearching(false);
    }
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setHelperMessage((t as any)('geolocationNotSupported'));
      return;
    }

    setIsLocating(true);
    setHelperMessage(null);
    setSuggestions([]);
    setHighlightedSuggestionIndex(-1);
    setIsSuggestionListOpen(false);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = Number(position.coords.latitude.toFixed(6));
        const longitude = Number(position.coords.longitude.toFixed(6));
        applyLocation(longitude, latitude);
        setHelperMessage((t as any)('usingCurrentLocation'));
        setIsLocating(false);
      },
      () => {
        setHelperMessage((t as any)('cannotAccessLocation'));
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  if (!accessToken) {
    return (
      <div className={className ?? ''}>
        <div className="flex h-full w-full items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-center text-xs text-slate-600">
          {(t as any)('missingMapboxToken')}
        </div>
      </div>
    );
  }

  return (
    <div className={`${className ?? ''} relative overflow-hidden`}>
      <div className="pointer-events-none absolute left-2 right-2 top-2 z-10 space-y-2">
        <div className="pointer-events-auto flex items-center gap-2 rounded-lg bg-white/95 p-2 shadow">
          <input
            ref={inputRef}
            type="text"
            value={addressQuery}
            onFocus={() => {
              setIsSuggestionListOpen(true);
            }}
            onBlur={() => {
              window.setTimeout(() => {
                setIsSuggestionListOpen(false);
              }, 120);
            }}
            onChange={(event) => {
              setAddressQuery(event.target.value);
              if (!isSuggestionListOpen) {
                setIsSuggestionListOpen(true);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' && suggestions.length > 0) {
                event.preventDefault();
                setHighlightedSuggestionIndex((previous) =>
                  previous < suggestions.length - 1 ? previous + 1 : 0,
                );
                return;
              }

              if (event.key === 'ArrowUp' && suggestions.length > 0) {
                event.preventDefault();
                setHighlightedSuggestionIndex((previous) =>
                  previous > 0 ? previous - 1 : suggestions.length - 1,
                );
                return;
              }

              if (event.key === 'Enter') {
                event.preventDefault();

                if (isSuggestionListOpen && suggestions.length > 0) {
                  const safeIndex = highlightedSuggestionIndex >= 0 ? highlightedSuggestionIndex : 0;
                  const pickedSuggestion = suggestions[safeIndex];
                  if (pickedSuggestion) {
                    selectSuggestion(pickedSuggestion);
                    return;
                  }
                }

                void handleSearchAddress();
              }

              if (event.key === 'Escape') {
                setIsSuggestionListOpen(false);
                setHighlightedSuggestionIndex(-1);
              }
            }}
            placeholder={(t as any)('searchAddressPlaceholder')}
            className="h-8 flex-1 rounded-md border border-slate-300 px-2 text-xs text-slate-700 outline-none focus:border-emerald-500"
          />
          <button
            type="button"
            onClick={() => {
              void handleSearchAddress();
            }}
            disabled={isSearching || !addressQuery.trim()}
            className="h-8 rounded-md bg-emerald-600 px-2.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            title={(t as any)('searchAddressTooltip')}
            aria-label={(t as any)('searchAddressTooltip')}
          >
            {isSearching ? '...' : (t as any)('findAddressBtn')}
          </button>
          <button
            type="button"
            onClick={handleUseCurrentLocation}
            disabled={isLocating}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed"
            title={(t as any)('useCurrentLocationTooltip')}
            aria-label={(t as any)('useCurrentLocationTooltip')}
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

        {isSuggestionListOpen && suggestions.length > 0 && (
          <div className="pointer-events-auto rounded-md bg-white/95 p-1 shadow">
            {suggestions.map((suggestion, index) => (
              <button
                key={suggestion.id}
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onClick={() => {
                  selectSuggestion(suggestion);
                }}
                className={`block w-full rounded px-2 py-1 text-left text-[11px] text-slate-700 transition hover:bg-slate-100 ${
                  index === highlightedSuggestionIndex ? 'bg-slate-100' : ''
                }`}
              >
                {suggestion.placeName}
              </button>
            ))}
          </div>
        )}
      </div>

      <div ref={containerRef} className="h-full w-full rounded-xl" />
    </div>
  );
}
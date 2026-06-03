'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import type { DeviceDto } from '@/types/device';

type DeviceLocationMapProps = {
  devices: DeviceDto[];
  className?: string;
};

const DEFAULT_CENTER = {
  lat: 21.0285,
  lng: 105.8542,
};

const DEFAULT_ZOOM = 11.5;
const MAX_FIT_BOUNDS_ZOOM = 14;
const FIT_BOUNDS_PADDING = 56;

const formatDeviceStatus = (status: string) => {
  const normalized = String(status || '').trim().toUpperCase();
  if (normalized === 'ONLINE') return 'Online';
  if (normalized === 'OFFLINE') return 'Offline';
  return normalized || 'Unknown';
};

function DeviceLocationMap({ devices, className }: DeviceLocationMapProps) {
  const accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  const [mapErrorMessage, setMapErrorMessage] = useState<string | null>(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<globalThis.Map<string, mapboxgl.Marker>>(new globalThis.Map());

  const validDevices = useMemo(
    () => devices.filter((device) => Number.isFinite(device.latitude) && Number.isFinite(device.longitude)),
    [devices],
  );

  const onlineCount = useMemo(
    () => validDevices.filter((device) => String(device.status).toUpperCase() === 'ONLINE').length,
    [validDevices],
  );

  const offlineCount = validDevices.length - onlineCount;

  useEffect(() => {
    if (!accessToken || !containerRef.current || mapRef.current) return;
    const markers = markersRef.current;

    mapboxgl.accessToken = accessToken;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/outdoors-v12',
      center: [DEFAULT_CENTER.lng, DEFAULT_CENTER.lat],
      zoom: DEFAULT_ZOOM,
      attributionControl: false,
    });

    map.on('error', (event) => {
      const message = event.error?.message || 'Cannot load Mapbox map right now.';
      setMapErrorMessage(message);
    });

    map.on('load', () => {
      setIsMapLoaded(true);
      map.resize();
    });

    const handleResize = () => {
      map.resize();
    };

    window.addEventListener('resize', handleResize);

    requestAnimationFrame(() => {
      map.resize();
    });

    mapRef.current = map;

    return () => {
      window.removeEventListener('resize', handleResize);
      markers.forEach((marker) => marker.remove());
      markers.clear();
      map.remove();
      mapRef.current = null;
    };
  }, [accessToken]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current.clear();

    const createMarkerElement = (isOnline: boolean, deviceName: string) => {
      const markerElement = document.createElement('div');
      markerElement.title = deviceName;
      markerElement.setAttribute('aria-label', deviceName);
      markerElement.style.width = '16px';
      markerElement.style.height = '16px';
      markerElement.style.borderRadius = '9999px';
      markerElement.style.border = '2px solid rgba(255, 255, 255, 0.95)';
      markerElement.style.background = isOnline ? '#16a34a' : '#dc2626';
      markerElement.style.boxShadow = isOnline
        ? '0 8px 18px rgba(22, 163, 74, 0.28)'
        : '0 8px 18px rgba(220, 38, 38, 0.28)';
      markerElement.style.cursor = 'pointer';

      return markerElement;
    };

    validDevices.forEach((device) => {
      const isOnline = String(device.status).toUpperCase() === 'ONLINE';
      const markerElement = createMarkerElement(isOnline, device.name);
      const popup = new mapboxgl.Popup({
        offset: 18,
        closeButton: false,
        closeOnClick: false,
        className: 'device-location-popup',
      }).setDOMContent(
        Object.assign(document.createElement('div'), {
          innerHTML: `
            <div style="min-width: 160px; padding: 2px 0; font-size: 12px; line-height: 1.5; color: #0f172a;">
              <div style="font-weight: 700; margin-bottom: 2px;">${device.mac}</div>
              <div>Status: <span style="font-weight: 600; color: ${isOnline ? '#16a34a' : '#dc2626'};">${formatDeviceStatus(device.status)}</span></div>
            </div>
          `,
        }),
      );

      markerElement.addEventListener('mouseenter', () => {
        popup.setLngLat([device.longitude as number, device.latitude as number]).addTo(map);
      });

      markerElement.addEventListener('mouseleave', () => {
        popup.remove();
      });

      const marker = new mapboxgl.Marker({ element: markerElement, anchor: 'center' })
        .setLngLat([device.longitude as number, device.latitude as number])
        .addTo(map);

      markersRef.current.set(device.id, marker);
    });

    if (validDevices.length === 0) {
      map.easeTo({ center: [DEFAULT_CENTER.lng, DEFAULT_CENTER.lat], zoom: DEFAULT_ZOOM, duration: 350 });
      return;
    }

    if (validDevices.length === 1) {
      const onlyDevice = validDevices[0];
      map.easeTo({
        center: [onlyDevice.longitude as number, onlyDevice.latitude as number],
        zoom: Math.max(DEFAULT_ZOOM, 13.5),
        duration: 420,
      });
      return;
    }

    const bounds = new mapboxgl.LngLatBounds(
      [validDevices[0].longitude as number, validDevices[0].latitude as number],
      [validDevices[0].longitude as number, validDevices[0].latitude as number],
    );

    validDevices.forEach((device) => {
      bounds.extend([device.longitude as number, device.latitude as number]);
    });

    map.fitBounds(bounds, {
      padding: FIT_BOUNDS_PADDING,
      duration: 500,
      maxZoom: MAX_FIT_BOUNDS_ZOOM,
    });
  }, [isMapLoaded, validDevices]);

  if (!accessToken) {
    return (
      <div className={className ?? ''}>
        <div className="flex h-full min-h-110 w-full items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-600">
          Missing NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN in environment.
        </div>
      </div>
    );
  }

  if (mapErrorMessage) {
    return (
      <div className={className ?? ''}>
        <div className="flex h-full min-h-110 w-full items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center text-sm text-rose-600">
          Mapbox failed to load: {mapErrorMessage}
        </div>
      </div>
    );
  }

  return (
    <div className={className ?? ''}>
      <div className="relative h-full min-h-110 w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-[0_10px_30px_rgba(20,45,80,0.08)]">
        <div ref={containerRef} className="h-full w-full" />

        <div className="pointer-events-none absolute left-4 top-4 z-10 flex flex-wrap gap-2">
          <div className="rounded-full border border-slate-200 bg-white/92 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm backdrop-blur">
            {validDevices.length} device{validDevices.length === 1 ? '' : 's'} with coordinates
          </div>
          <div className="rounded-full border border-slate-200 bg-white/92 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm backdrop-blur">
            {onlineCount} online · {offlineCount} offline
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-4 right-4 z-10 rounded-2xl border border-slate-200 bg-white/92 px-3 py-2 text-[11px] font-medium text-slate-600 shadow-sm backdrop-blur">
          Device positions only
        </div>
      </div>
    </div>
  );
}

export default DeviceLocationMap;
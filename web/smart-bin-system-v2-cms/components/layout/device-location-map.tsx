'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useLanguage } from '@/lib/language'; // IMPORT HOOK NGÔN NGỮ
import type { DeviceDto } from '@/types/device';

type DeviceLocationMapProps = {
  devices: DeviceDto[];
  className?: string;
  onDeviceClick?: (device: DeviceDto) => void;
};

const DEFAULT_CENTER = {
  lat: 21.0056, 
  lng: 105.8434,
};

const DEFAULT_ZOOM = 11.5;
const MAX_FIT_BOUNDS_ZOOM = 14;
const FIT_BOUNDS_PADDING = 56;
const MAP_STYLES = ['mapbox://styles/mapbox/outdoors-v12', 'mapbox://styles/mapbox/streets-v12'] as const;

function DeviceLocationMap({ devices, className, onDeviceClick }: DeviceLocationMapProps) {
  const accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  const { t } = useLanguage(); // GỌI HOOK
  
  const [mapErrorMessage, setMapErrorMessage] = useState<string | null>(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [showLoadingWarning, setShowLoadingWarning] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const isMapLoadedRef = useRef(false);
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

  // Đưa hàm format vào trong để dùng t()
  const formatDeviceStatus = (status: string) => {
    const normalized = String(status || '').trim().toUpperCase();
    if (normalized === 'ONLINE') return t('onlineStatus');
    if (normalized === 'OFFLINE') return t('offlineStatus');
    return normalized || t('offlineStatus');
  };

  useEffect(() => {
    if (!accessToken || !containerRef.current || mapRef.current) return;
    const markers = markersRef.current;
    let active = true;
    let didFallbackStyle = false;

    // let loadTimeout: ReturnType<typeof setTimeout>;
    let resizeTimeout1: ReturnType<typeof setTimeout>;
    // let resizeTimeout2: ReturnType<typeof setTimeout>;
    // let resizeTimeout3: ReturnType<typeof setTimeout>;
    let raf1: number;
    // let raf2: number;

    mapboxgl.accessToken = accessToken;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAP_STYLES[0],
      center: [DEFAULT_CENTER.lng, DEFAULT_CENTER.lat],
      zoom: DEFAULT_ZOOM,
      attributionControl: false,
    });

    map.on('error', (event) => {
      const message = event.error?.message || t('mapErrorDefault');
      if (!didFallbackStyle && message.toLowerCase().includes('style')) {
        didFallbackStyle = true;
        map.setStyle(MAP_STYLES[1]);
        return;
      }
      if (active) setMapErrorMessage(message);
    });

    map.on('load', () => {
      if (!active) return;
      isMapLoadedRef.current = true;
      setIsMapLoaded(true);
      setShowLoadingWarning(false);
      
      map.resize();
      raf1 = requestAnimationFrame(() => { if (active) map.resize(); });
      resizeTimeout1 = setTimeout(() => { if (active) map.resize(); }, 180);
    });

    const handleResize = () => { if (active) map.resize(); };
    window.addEventListener('resize', handleResize);

    const raf2 = requestAnimationFrame(() => { if (active) map.resize(); });
    const resizeTimeout2 = setTimeout(() => { if (active) map.resize(); }, 80);
    const resizeTimeout3 = setTimeout(() => { if (active) map.resize(); }, 260);

    const loadTimeout = setTimeout(() => {
      if (!active || isMapLoadedRef.current) return;
      setShowLoadingWarning(true);
    }, 8000);

    mapRef.current = map;

    return () => {
      active = false;
      clearTimeout(loadTimeout);
      clearTimeout(resizeTimeout1);
      clearTimeout(resizeTimeout2);
      clearTimeout(resizeTimeout3);
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      
      window.removeEventListener('resize', handleResize);
      markers.forEach((marker) => marker.remove());
      markers.clear();
      map.remove();
      isMapLoadedRef.current = false;
      mapRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      markerElement.setAttribute('role', 'button');
      markerElement.tabIndex = 0;
      markerElement.style.cursor = 'pointer';
      
      markerElement.style.width = '32px';
      markerElement.style.height = '32px';
      
      const img = document.createElement('img');
      img.src = isOnline ? '/icons/pin_online.svg' : '/icons/pin_offline.svg';
      img.alt = isOnline ? t('deviceOnline') : t('deviceOffline');
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.filter = 'drop-shadow(0px 4px 6px rgba(0,0,0,0.15))';
      
      markerElement.appendChild(img);

      return markerElement;
    };

    validDevices.forEach((device) => {
      const isOnline = String(device.status).toUpperCase() === 'ONLINE';
      const markerElement = createMarkerElement(isOnline, device.name);
      
      const popup = new mapboxgl.Popup({
        offset: [0, -32], 
        closeButton: false,
        closeOnClick: false,
        className: 'device-location-popup',
      }).setDOMContent(
        Object.assign(document.createElement('div'), {
          innerHTML: `
            <div style="min-width: 160px; padding: 2px 0; font-size: 12px; line-height: 1.5; color: #0f172a;">
              <div style="font-weight: 700; margin-bottom: 2px;">${device.name}</div>
              <div style="font-weight: 700; margin-bottom: 2px;">${device.mac}</div>
              <div>${t('statusLabel')} <span style="font-weight: 600; color: ${isOnline ? '#16a34a' : '#64748b'};">${formatDeviceStatus(device.status)}</span></div>
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

      markerElement.addEventListener('click', () => {
        onDeviceClick?.(device);
      });

      markerElement.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onDeviceClick?.(device);
        }
      });

      const marker = new mapboxgl.Marker({ element: markerElement, anchor: 'bottom' })
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMapLoaded, validDevices, t]); // Thêm t vào dependency array

  if (!accessToken) {
    return (
      <div className={className ?? ''}>
        <div className="flex h-full min-h-110 w-full items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-600">
          {t('missingMapToken')}
        </div>
      </div>
    );
  }

  if (mapErrorMessage) {
    return (
      <div className={className ?? ''}>
        <div className="flex h-full min-h-110 w-full items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center text-sm text-rose-600">
          {t('mapFailedToLoad')} {mapErrorMessage}
        </div>
      </div>
    );
  }

  return (
    <div className={className ?? ''}>
      <div className="relative h-full min-h-110 w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-[0_10px_30px_rgba(20,45,80,0.08)]">
        <div ref={containerRef} className="h-full w-full" />

        {!isMapLoaded ? (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-slate-50/80 text-sm font-medium text-slate-600 backdrop-blur-[1px]">
            {showLoadingWarning ? t('stillLoadingMap') : t('loadingMap')}
          </div>
        ) : null}

        <div className="pointer-events-none absolute left-4 top-4 z-10 flex flex-wrap gap-2">
          <div className="rounded-full border border-slate-200 bg-white/92 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm backdrop-blur">
            {validDevices.length} {validDevices.length === 1 ? t('deviceWithCoordinates') : t('devicesWithCoordinates')}
          </div>
          <div className="rounded-full border border-slate-200 bg-white/92 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm backdrop-blur">
            {onlineCount} {t('onlineLabel')} · {offlineCount} {t('offlineLabel')}
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-4 right-4 z-10 rounded-2xl border border-slate-200 bg-white/92 px-3 py-2 text-[11px] font-medium text-slate-600 shadow-sm backdrop-blur">
          {t('devicePositionsOnly')}
        </div>
      </div>
    </div>
  );
}

export default DeviceLocationMap;
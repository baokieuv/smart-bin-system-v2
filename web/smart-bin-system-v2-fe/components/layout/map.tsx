'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { DeviceDto } from '@/types/device';

type DeviceMapProps = {
  devices: DeviceDto[];
  selectedDeviceId: string | null;
  onSelectDevice: (deviceId: string) => void;
  className?: string;
};

const DEFAULT_CENTER = {
  lat: 21.0285,
  lng: 105.8542,
};

const DEFAULT_ZOOM = 12;
const SELECTED_DEVICE_ZOOM = 16;
const MAX_FIT_BOUNDS_ZOOM = 13;
const SELECTED_ZOOM_STEP = 1.2;

function DeviceMap({ devices, selectedDeviceId, onSelectDevice, className }: DeviceMapProps) {
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

  useEffect(() => {
    if (!accessToken || !containerRef.current || mapRef.current) return;
    const markers = markersRef.current;

    mapboxgl.accessToken = accessToken;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
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
      // Resize once map style is ready so hidden/flex containers render tiles correctly.
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

    validDevices.forEach((device) => {
      const isOnline = String(device.status).toUpperCase() === 'ONLINE';
      const isSelected = selectedDeviceId === device.id;

      const markerElement = document.createElement('button');
      markerElement.type = 'button';
      markerElement.style.width = isSelected ? '20px' : '16px';
      markerElement.style.height = isSelected ? '20px' : '16px';
      markerElement.style.borderRadius = '9999px';
      markerElement.style.backgroundColor = isOnline ? '#10b981' : '#ef4444';
      markerElement.style.border = `${isSelected ? 3 : 2}px solid #ffffff`;
      markerElement.style.boxSizing = 'border-box';
      markerElement.style.boxShadow = '0 2px 8px rgba(15, 23, 42, 0.35)';
      markerElement.style.cursor = 'pointer';

      markerElement.addEventListener('click', () => {
        onSelectDevice(device.id);
      });

      const marker = new mapboxgl.Marker({ element: markerElement, anchor: 'center' })
        .setLngLat([device.longitude, device.latitude])
        .setPopup(
          new mapboxgl.Popup({ offset: 16 }).setText(`${device.name} (${isOnline ? 'online' : 'offline'})`),
        )
        .addTo(map);

      markersRef.current.set(device.id, marker);
    });

    if (selectedDeviceId) {
      const selectedDevice = validDevices.find((device) => device.id === selectedDeviceId);
      if (selectedDevice) {
        const currentZoom = map.getZoom();
        const targetZoom = Math.min(
          Math.max(currentZoom + SELECTED_ZOOM_STEP, MAX_FIT_BOUNDS_ZOOM + 1),
          SELECTED_DEVICE_ZOOM,
        );

        map.flyTo({
          center: [selectedDevice.longitude, selectedDevice.latitude],
          zoom: targetZoom,
          duration: 1100,
          curve: 1.35,
          speed: 0.75,
          essential: true,
        });
        return;
      }
    }

    if (validDevices.length === 0) {
      map.easeTo({ center: [DEFAULT_CENTER.lng, DEFAULT_CENTER.lat], zoom: DEFAULT_ZOOM });
      return;
    }

    const bounds = new mapboxgl.LngLatBounds(
      [validDevices[0].longitude, validDevices[0].latitude],
      [validDevices[0].longitude, validDevices[0].latitude],
    );
    validDevices.forEach((device) => {
      bounds.extend([device.longitude, device.latitude]);
    });
    map.fitBounds(bounds, { padding: 60, duration: 400, maxZoom: MAX_FIT_BOUNDS_ZOOM });
  }, [isMapLoaded, onSelectDevice, selectedDeviceId, validDevices]);

  if (!accessToken) {
    return (
      <div className={className ?? ''}>
        <div className="flex h-full w-full items-center justify-center rounded-2xl bg-slate-100 p-4 text-center text-sm text-slate-600">
          Missing NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN in environment.
        </div>
      </div>
    );
  }

  if (mapErrorMessage) {
    return (
      <div className={className ?? ''}>
        <div className="flex h-full w-full items-center justify-center rounded-2xl bg-slate-100 p-4 text-center text-sm text-rose-600">
          Mapbox failed to load: {mapErrorMessage}
        </div>
      </div>
    );
  }

  return (
    <div className={className ?? ''}>
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}

export default DeviceMap;
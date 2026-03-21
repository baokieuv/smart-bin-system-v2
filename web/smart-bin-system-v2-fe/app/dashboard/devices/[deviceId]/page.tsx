'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Surface } from '@/components/ui/surface';
import { Button } from '@/components/ui/button';
import { ToastStack } from '@/components/ui/toast-stack';
import { deviceApi } from '@/services/api/device';
import { DeviceDto, DeviceTelemetries } from '@/types/device';
import { Input } from '@/components/ui/input';

type Toast = {
  id: number;
  message: string;
  type: 'success' | 'error';
};

type DeviceTelemetryHistoryItem = {
  timestamp: number;
  fillLevel: number | null;
  throwCount: number | null;
};

const formatTime = (value: string) =>
  new Date(value).toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

const toNumber = (value: string | undefined) => {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const buildTelemetryHistory = (telemetries: DeviceTelemetries): DeviceTelemetryHistoryItem[] => {
  const fillPoints = [
    ...(telemetries.fillLevel ?? []),
    ...(telemetries.trashLevel ?? []),
    ...(telemetries.binFillLevel ?? []),
  ];

  const throwPoints = [
    ...(telemetries.throwCount ?? []),
    ...(telemetries.wasteCount ?? []),
    ...(telemetries.garbageThrowCount ?? []),
  ];

  const grouped = new Map<number, DeviceTelemetryHistoryItem>();

  fillPoints.forEach((point) => {
    const existing = grouped.get(point.ts) ?? { timestamp: point.ts, fillLevel: null, throwCount: null };
    existing.fillLevel = toNumber(point.value);
    grouped.set(point.ts, existing);
  });

  throwPoints.forEach((point) => {
    const existing = grouped.get(point.ts) ?? { timestamp: point.ts, fillLevel: null, throwCount: null };
    existing.throwCount = toNumber(point.value);
    grouped.set(point.ts, existing);
  });

  return Array.from(grouped.values())
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 20);
};

export default function DeviceDetailPage() {
  const params = useParams<{ deviceId: string }>();
  const [device, setDevice] = useState<DeviceDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [telemetryHistory, setTelemetryHistory] = useState<DeviceTelemetryHistoryItem[]>([]);
  const [isTelemetryLoading, setIsTelemetryLoading] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isDeletePopupOpen, setIsDeletePopupOpen] = useState(false);
  const [isEditPopupOpen, setIsEditPopupOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editLatitude, setEditLatitude] = useState('');
  const [editLongitude, setEditLongitude] = useState('');
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);

  const pushToast = (message: string, type: Toast['type']) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, message, type }]);

    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 2500);
  };

  const latestTelemetry = useMemo(() => telemetryHistory[0] ?? null, [telemetryHistory]);

  useEffect(() => {
    const fetchDeviceData = async () => {
      if (!params.deviceId) return;

      try {
        setIsLoading(true);
        const response = await deviceApi.getDetail(params.deviceId);

        if (response.success && response.data) {
          const fetchedDevice = response.data as DeviceDto;
          setDevice(fetchedDevice);
          setEditName(fetchedDevice.name || '');
          setEditLatitude(String(fetchedDevice.latitude ?? ''));
          setEditLongitude(String(fetchedDevice.longitude ?? ''));
        } else {
          setDevice(null);
          pushToast(response.message || 'Failed to load device detail.', 'error');
        }
      } catch {
        setDevice(null);
        pushToast('Failed to load device detail.', 'error');
      } finally {
        setIsLoading(false);
      }
    };

    fetchDeviceData();
  }, [params.deviceId]);

  useEffect(() => {
    const fetchTelemetry = async () => {
      if (!params.deviceId) return;

      try {
        setIsTelemetryLoading(true);
        const now = Date.now();
        const response = await deviceApi.getTelemetries(params.deviceId, {
          keys: 'fillLevel,trashLevel,binFillLevel,throwCount,wasteCount,garbageThrowCount',
          startTs: now - 7 * 24 * 60 * 60 * 1000,
          endTs: now,
          limit: 100,
        });

        if (response.success && response.data) {
          setTelemetryHistory(buildTelemetryHistory(response.data as DeviceTelemetries));
        } else {
          setTelemetryHistory([]);
        }
      } catch {
        setTelemetryHistory([]);
      } finally {
        setIsTelemetryLoading(false);
      }
    };

    fetchTelemetry();
  }, [params.deviceId]);

  const handleUpdateDevice = async () => {
    if (!device) return;

    const latitude = Number(editLatitude);
    const longitude = Number(editLongitude);

    if (!editName.trim()) {
      pushToast('Device name is required.', 'error');
      return;
    }

    if (Number.isNaN(latitude) || latitude < -90 || latitude > 90) {
      pushToast('Latitude must be between -90 and 90.', 'error');
      return;
    }

    if (Number.isNaN(longitude) || longitude < -180 || longitude > 180) {
      pushToast('Longitude must be between -180 and 180.', 'error');
      return;
    }

    try {
      setIsSubmittingAction(true);
      const response = await deviceApi.update(device.id, {
        name: editName.trim(),
        latitude,
        longitude,
        scope: 'SERVER_SCOPE',
        additionalAttributes: {},
      });

      if (!response.success || !response.data) {
        pushToast(response.message || 'Failed to update device.', 'error');
        return;
      }

      setDevice(response.data as DeviceDto);
      setIsEditPopupOpen(false);
      pushToast('Device updated successfully.', 'success');
    } catch {
      pushToast('Failed to update device.', 'error');
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const handleDeleteDevice = async () => {
    if (!device) return;

    try {
      setIsSubmittingAction(true);
      const response = await deviceApi.delete(device.id);

      if (!response.success) {
        pushToast(response.message || 'Failed to delete device.', 'error');
        return;
      }

      pushToast('Device deleted successfully.', 'success');
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 400);
    } catch {
      pushToast('Failed to delete device.', 'error');
    } finally {
      setIsSubmittingAction(false);
      setIsDeletePopupOpen(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Surface className="p-6 text-center">
          <p className="text-sm text-slate-700">Loading device detail...</p>
        </Surface>
      </div>
    );
  }

  if (!device) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Surface className="p-6 text-center">
          <h1 className="text-xl font-bold text-slate-900">Device Not Found</h1>
          <p className="mt-2 text-sm text-slate-600">The requested device detail UI does not exist in mock data.</p>
          <Link
            href="/dashboard"
            className="mt-4 inline-block rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Back to Dashboard
          </Link>
        </Surface>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8">
      <Surface className="mx-auto max-w-4xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Device Detail Page</p>
            <h1 className="text-2xl font-bold text-slate-900">{device.name}</h1>
          </div>

          <Link
            href="/dashboard"
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            Back to Dashboard
          </Link>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
            <p><span className="font-semibold text-slate-700">Name:</span> {device.name}</p>
            <p><span className="font-semibold text-slate-700">MAC Address:</span> {device.mac}</p>
            <p>
              <span className="font-semibold text-slate-700">Location:</span> {device.longitude.toFixed(6)}, {device.latitude.toFixed(6)}
            </p>
            <p>
              <span className="font-semibold text-slate-700">Status:</span>{' '}
              <span
                className={`rounded-full px-2 py-1 text-xs font-bold ${
                  device.status === 'ONLINE' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700'
                }`}
              >
                {device.status === 'ONLINE' ? 'online' : 'offline'}
              </span>
            </p>
            <p><span className="font-semibold text-slate-700">Added Time:</span> {formatTime(device.createdDate)}</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="mb-2 text-sm font-semibold text-slate-700">
              Trash Level: {latestTelemetry?.fillLevel !== null && latestTelemetry?.fillLevel !== undefined ? `${latestTelemetry.fillLevel}%` : 'N/A'}
            </p>
            <div className="h-2 w-full rounded-full bg-slate-200">
              <div
                className={`h-2 rounded-full ${
                  (latestTelemetry?.fillLevel ?? 0) >= 80 ? 'bg-red-500' : (latestTelemetry?.fillLevel ?? 0) >= 50 ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
                style={{ width: `${latestTelemetry?.fillLevel ?? 0}%` }}
              />
            </div>

            <p className="mt-3 text-sm text-slate-700">
              <span className="font-semibold">Waste Throws:</span>{' '}
              {latestTelemetry?.throwCount ?? 'N/A'}
            </p>
            <p className="mt-1 text-sm text-slate-700">
              <span className="font-semibold">Latest Sample:</span>{' '}
              {latestTelemetry?.timestamp ? formatTime(new Date(latestTelemetry.timestamp).toISOString()) : 'N/A'}
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => setIsEditPopupOpen(true)}
                className="bg-amber-500 hover:bg-amber-600"
              >
                Edit Device
              </Button>
              <Button
                type="button"
                onClick={() => setIsDeletePopupOpen(true)}
                variant="danger"
              >
                Delete Device
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Telemetry History</h3>
            {isTelemetryLoading ? <span className="text-xs text-slate-500">Loading...</span> : null}
          </div>

          {telemetryHistory.length === 0 ? (
            <p className="text-sm text-slate-600">No telemetry data available yet.</p>
          ) : (
            <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-100">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-[0.14em] text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Sample Time</th>
                    <th className="px-3 py-2">Fill Level</th>
                    <th className="px-3 py-2">Waste Throws</th>
                  </tr>
                </thead>
                <tbody>
                  {telemetryHistory.map((item) => (
                    <tr key={item.timestamp} className="border-t border-slate-100">
                      <td className="px-3 py-2 text-slate-700">{formatTime(new Date(item.timestamp).toISOString())}</td>
                      <td className="px-3 py-2 text-slate-700">{item.fillLevel !== null ? `${item.fillLevel}%` : 'N/A'}</td>
                      <td className="px-3 py-2 text-slate-700">{item.throwCount ?? 'N/A'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Surface>

      {isDeletePopupOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <h2 className="text-lg font-bold text-slate-900">Delete Device</h2>
            <p className="mt-2 text-sm text-slate-600">
              Confirm deleting {device.name} ({device.mac})?
            </p>

            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                onClick={() => {
                  setIsDeletePopupOpen(false);
                }}
                variant="secondary"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleDeleteDevice}
                variant="danger"
                disabled={isSubmittingAction}
              >
                {isSubmittingAction ? 'Deleting...' : 'Confirm Delete'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {isEditPopupOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <h2 className="text-lg font-bold text-slate-900">Edit Device</h2>
            <p className="mt-2 text-sm text-slate-600">Update name and location coordinates.</p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">Device Name</label>
                <Input value={editName} onChange={(event) => setEditName(event.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-700">Latitude</label>
                  <Input value={editLatitude} onChange={(event) => setEditLatitude(event.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-700">Longitude</label>
                  <Input value={editLongitude} onChange={(event) => setEditLongitude(event.target.value)} />
                </div>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setIsEditPopupOpen(false)} disabled={isSubmittingAction}>
                Cancel
              </Button>
              <Button type="button" onClick={handleUpdateDevice} disabled={isSubmittingAction}>
                {isSubmittingAction ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <ToastStack toasts={toasts} />
    </div>
  );
}

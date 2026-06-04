'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Surface } from '@/components/ui/surface';
import { Button } from '@/components/ui/button';
import { ToastStack } from '@/components/ui/toast-stack';
import { deviceApi } from '@/services/api/device';
import { clearCache } from '@/lib/cache';
import { DeviceDto, DeviceTelemetries } from '@/types/device';
import { Input } from '@/components/ui/input';
import { LocationPickerMap, type LocationValue } from '@/components/layout/location-picker-map';
import { resolveMapboxLocationLabel } from '@/lib/mapbox-location';

type RpcMethodOption = {
  method: string;
  label: string;
  type: "ONE_WAY" | "TWO_WAY";
  description: string;
};

const rpcMethodOptions: RpcMethodOption[] = [
  { method: "openLid", label: "Open lid", type: "TWO_WAY", description: "Send the device command to open the lid." },
  { method: "closeLid", label: "Close lid", type: "TWO_WAY", description: "Send the device command to close the lid." },
  { method: "lockBin", label: "Lock bin", type: "TWO_WAY", description: "Lock the bin mechanism remotely." },
  { method: "unlockBin", label: "Unlock bin", type: "TWO_WAY", description: "Unlock the bin mechanism remotely." },
  { method: "forceSync", label: "Force sync", type: "ONE_WAY", description: "Force the device to sync state and telemetry." },
  { method: "triggerAlarmAlert", label: "Trigger alarm alert", type: "ONE_WAY", description: "Trigger a manual alarm alert on the device." },
];

const getRpcMethodOption = (method: string) => rpcMethodOptions.find((option) => option.method === method) ?? rpcMethodOptions[0];

const getDefaultRpcParams = (method: string) => {
  switch (method) {
    case "triggerAlarmAlert":
      return JSON.stringify({ message: "Manual alert" }, null, 2);
    default:
      return "{}";
  }
};

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

const parseCoordinatePair = (latitudeValue: string, longitudeValue: string): LocationValue | null => {
  const latitude = Number(latitudeValue);
  const longitude = Number(longitudeValue);

  if (Number.isNaN(latitude) || Number.isNaN(longitude)) return null;
  if (latitude < -90 || latitude > 90) return null;
  if (longitude < -180 || longitude > 180) return null;

  return { latitude, longitude };
};

const buildTelemetryHistory = (telemetries: DeviceTelemetries): DeviceTelemetryHistoryItem[] => {
  const binKeys = ['bin1', 'bin2', 'bin3', 'bin4'];
  const binPoints = binKeys.flatMap((k) => telemetries[k] ?? []);
  const totalPoints = telemetries.total_waste_count ?? [];

  type TempEntry = { timestamp: number; bins: number[]; throwCount: number | null };
  const grouped = new Map<number, TempEntry>();

  binPoints.forEach((point) => {
    const existing = grouped.get(point.ts) ?? { timestamp: point.ts, bins: [], throwCount: null };
    const val = toNumber(point.value);
    if (val !== null) existing.bins.push(val);
    grouped.set(point.ts, existing);
  });

  totalPoints.forEach((point) => {
    const existing = grouped.get(point.ts) ?? { timestamp: point.ts, bins: [], throwCount: null };
    existing.throwCount = toNumber(point.value);
    grouped.set(point.ts, existing);
  });

  const results: DeviceTelemetryHistoryItem[] = Array.from(grouped.values())
    .map((entry) => ({
      timestamp: entry.timestamp,
      fillLevel: entry.bins.length > 0 ? Math.round((entry.bins.reduce((s, v) => s + v, 0) / entry.bins.length) * 100) / 100 : null,
      throwCount: entry.throwCount,
    }))
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 20);

  return results;
};

export default function DeviceDetailPage() {
  const params = useParams<{ deviceId: string }>();
  const [device, setDevice] = useState<DeviceDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // const [locationLabel, setLocationLabel] = useState<string>('');
  const [telemetryHistory, setTelemetryHistory] = useState<DeviceTelemetryHistoryItem[]>([]);
  const [isTelemetryLoading, setIsTelemetryLoading] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [locationLabel, setLocationLabel] = useState('');
  const [isDeletePopupOpen, setIsDeletePopupOpen] = useState(false);
  const [isEditPopupOpen, setIsEditPopupOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editLatitude, setEditLatitude] = useState('');
  const [editLongitude, setEditLongitude] = useState('');
  const [editPollingInterval, setEditPollingInterval] = useState('');
  const [editFullThreshold, setEditFullThreshold] = useState('');
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);

  // RPC states
  const [isRpcPopupOpen, setIsRpcPopupOpen] = useState(false);
  const [selectedRpcMethod, setSelectedRpcMethod] = useState(rpcMethodOptions[0].method);
  const [rpcParamsText, setRpcParamsText] = useState(getDefaultRpcParams(rpcMethodOptions[0].method));
  const [rpcMessage, setRpcMessage] = useState("");
  const [rpcLoading, setRpcLoading] = useState(false);
  const [rpcResponseText, setRpcResponseText] = useState("");

  const closeRpcModal = () => {
    if (rpcLoading) return;
    setIsRpcPopupOpen(false);
    setSelectedRpcMethod(rpcMethodOptions[0].method);
    setRpcParamsText(getDefaultRpcParams(rpcMethodOptions[0].method));
    setRpcMessage("");
    setRpcResponseText("");
  };

  const executeSelectedRpc = async () => {
    if (!device) return;
    let parsedParams: Record<string, unknown> = {};
    if (rpcParamsText.trim()) {
      try {
        parsedParams = JSON.parse(rpcParamsText);
      } catch {
        setRpcMessage("Params must be valid JSON");
        return;
      }
    }

    setRpcLoading(true);
    setRpcMessage("");
    setRpcResponseText("");

    try {
      const response = await deviceApi.executeRpc(device.id, {
        method: selectedRpcMethod,
        params: parsedParams,
      });

      setRpcResponseText(JSON.stringify(response.data ?? response, null, 2));
      setRpcMessage(response.message || "RPC command sent");
    } catch (error) {
      setRpcMessage(error instanceof Error ? error.message : "Failed to send RPC command");
    } finally {
      setRpcLoading(false);
    }
  };

  const pushToast = (message: string, type: Toast['type']) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, message, type }]);

    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 2500);
  };

  const latestTelemetry = useMemo(() => telemetryHistory[0] ?? null, [telemetryHistory]);
  const editLocation = useMemo(
    () => parseCoordinatePair(editLatitude, editLongitude),
    [editLatitude, editLongitude],
  );

  const parseOptionalNumber = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return undefined;

    const parsed = Number(trimmed);
    return Number.isNaN(parsed) ? undefined : parsed;
  };

  const applyDeviceAttributes = (attributes: Record<string, unknown>) => {
    const pollingInterval = attributes.polling_interval;
    const fullThreshold = attributes.full_threshold;

    setEditPollingInterval(
      pollingInterval === undefined || pollingInterval === null ? '' : String(pollingInterval),
    );
    setEditFullThreshold(
      fullThreshold === undefined || fullThreshold === null ? '' : String(fullThreshold),
    );
  };

  useEffect(() => {
    if (!device) {
      setLocationLabel('');
      return;
    }

    let cancelled = false;

    const resolveLocation = async () => {
      setLocationLabel('Resolving location from Mapbox...');

      try {
        const label = await resolveMapboxLocationLabel(device.longitude, device.latitude);
        if (cancelled) return;

        setLocationLabel(label);
      } catch {
        if (cancelled) return;

        setLocationLabel('Unknown location');
      }
    };

    void resolveLocation();

    return () => {
      cancelled = true;
    };
  }, [device]);

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
          applyDeviceAttributes(fetchedDevice.userConfigs ?? {});
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
          keys: 'bin1,bin2,bin3,bin4,total_waste_count',
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

    const location = parseCoordinatePair(editLatitude, editLongitude);

    if (!editName.trim()) {
      pushToast('Device name is required.', 'error');
      return;
    }

    if (!location) {
      pushToast('Please select a valid location on map.', 'error');
      return;
    }

    try {
      setIsSubmittingAction(true);
      const response = await deviceApi.update(device.id, {
        name: editName.trim(),
        latitude: location.latitude,
        longitude: location.longitude,
        pollingInterval: parseOptionalNumber(editPollingInterval),
        fullThreshold: parseOptionalNumber(editFullThreshold),
        scope: 'SERVER_SCOPE',
        additionalAttributes: {},
      });

      if (!response.success || !response.data) {
        pushToast(response.message || 'Failed to update device.', 'error');
        return;
      }

      clearCache(`device:${device.id}`);
      const refreshed = await deviceApi.getDetail(device.id);
      if (refreshed.success && refreshed.data) {
        const fetchedDevice = refreshed.data as DeviceDto;
        setDevice(fetchedDevice);
        setEditName(fetchedDevice.name || '');
        setEditLatitude(String(fetchedDevice.latitude ?? ''));
        setEditLongitude(String(fetchedDevice.longitude ?? ''));
        applyDeviceAttributes(fetchedDevice.userConfigs ?? {});
      }
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

      clearCache(`device:${device.id}`);
      await deviceApi.getList();
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
            <p><span className="font-semibold text-slate-700">Location:</span> {locationLabel || 'Resolving location from Mapbox...'}</p>
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
                onClick={() => setIsRpcPopupOpen(true)}
                className="bg-blue-600 text-white hover:bg-blue-700"
              >
                Device Control
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
            <p className="mt-2 text-sm text-slate-600">Update name and location.</p>

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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-700">Polling Interval</label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={editPollingInterval}
                    onChange={(event) => setEditPollingInterval(event.target.value)}
                    placeholder="Seconds"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-700">Full Threshold</label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editFullThreshold}
                    onChange={(event) => setEditFullThreshold(event.target.value)}
                    placeholder="Percent"
                  />
                </div>
              </div>

              <div>
                <p className="mb-1 block text-sm font-semibold text-slate-700">Pick Location on Map</p>
                <LocationPickerMap
                  className="h-52 w-full rounded-xl border border-slate-200"
                  value={editLocation}
                  onChange={(location) => {
                    setEditLatitude(location.latitude.toFixed(6));
                    setEditLongitude(location.longitude.toFixed(6));
                  }}
                />
                {!editLocation && (editLatitude || editLongitude) && (
                  <p className="mt-1 text-xs text-rose-600">Invalid coordinates. Latitude: -90..90, Longitude: -180..180.</p>
                )}
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

      {isRpcPopupOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
            <h2 className="text-lg font-bold text-slate-900">Device Control</h2>
            <p className="mt-2 text-sm text-slate-600">Choose an RPC method, review params, then send the command</p>

            <form onSubmit={(e) => { e.preventDefault(); executeSelectedRpc(); }} className="mt-5 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-2">Two-Way Methods</h3>
                    <div className="grid grid-cols-2 gap-2">
                      {rpcMethodOptions.filter((option) => option.type === "TWO_WAY").map((option) => (
                        <button
                          key={option.method}
                          type="button"
                          onClick={() => {
                            setSelectedRpcMethod(option.method);
                            setRpcParamsText(getDefaultRpcParams(option.method));
                            setRpcMessage("");
                            setRpcResponseText("");
                          }}
                          className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                            selectedRpcMethod === option.method
                              ? "border-blue-600 bg-blue-50 text-blue-700"
                              : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                          }`}
                        >
                          <div className="font-semibold">{option.label}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-2">One-Way Methods</h3>
                    <div className="grid grid-cols-2 gap-2">
                      {rpcMethodOptions.filter((option) => option.type === "ONE_WAY").map((option) => (
                        <button
                          key={option.method}
                          type="button"
                          onClick={() => {
                            setSelectedRpcMethod(option.method);
                            setRpcParamsText(getDefaultRpcParams(option.method));
                            setRpcMessage("");
                            setRpcResponseText("");
                          }}
                          className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                            selectedRpcMethod === option.method
                              ? "border-blue-600 bg-blue-50 text-blue-700"
                              : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                          }`}
                        >
                          <div className="font-semibold">{option.label}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-medium text-slate-700">RPC params JSON</label>
                    <span className="text-xs text-slate-500">Selected: {getRpcMethodOption(selectedRpcMethod).method}</span>
                  </div>
                  <textarea
                    className="w-full h-32 rounded-lg border border-slate-300 p-2 font-mono text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    value={rpcParamsText}
                    onChange={(event) => setRpcParamsText(event.target.value)}
                    placeholder="{}"
                  />

                  <div className="rounded-lg bg-white p-3 text-sm text-slate-700 shadow-sm border border-slate-200">
                    <p className="font-semibold text-slate-900">Selected method: {getRpcMethodOption(selectedRpcMethod).label}</p>
                    <p>{getRpcMethodOption(selectedRpcMethod).description}</p>
                  </div>

                  <Button
                    type="submit"
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                    disabled={rpcLoading}
                  >
                    {rpcLoading ? "Sending..." : "Send RPC command"}
                  </Button>
                  
                  {rpcMessage ? <p className="text-sm text-slate-600">{rpcMessage}</p> : null}
                  
                  {rpcResponseText ? (
                    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-100 p-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Response</p>
                      <pre className="overflow-x-auto whitespace-pre-wrap wrap-break-word font-mono text-xs leading-6">{rpcResponseText}</pre>
                    </div>
                  ) : null}
                </div>
              </div>
            </form>

            <div className="mt-5 flex justify-end">
              <Button type="button" variant="secondary" onClick={closeRpcModal} disabled={rpcLoading}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      <ToastStack toasts={toasts} />
    </div>
  );
}

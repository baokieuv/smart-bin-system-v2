'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { mockDevices } from '../../../../lib/mock-devices';
import { Surface } from '@/components/ui/surface';
import { Button } from '@/components/ui/button';
import { ToastStack } from '@/components/ui/toast-stack';

type Toast = {
  id: number;
  message: string;
  type: 'success' | 'error';
};

const formatTime = (value: string) =>
  new Date(value).toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

export default function DeviceDetailPage() {
  const params = useParams<{ deviceId: string }>();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isDeletePopupOpen, setIsDeletePopupOpen] = useState(false);

  const device = useMemo(() => mockDevices.find((item) => item.id === params.deviceId) ?? null, [params.deviceId]);

  const pushToast = (message: string, type: Toast['type']) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, message, type }]);

    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 2500);
  };

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
            <p><span className="font-semibold text-slate-700">MAC Address:</span> {device.macAddress}</p>
            <p>
              <span className="font-semibold text-slate-700">Location:</span> {device.longitude.toFixed(6)}, {device.latitude.toFixed(6)}
            </p>
            <p>
              <span className="font-semibold text-slate-700">Status:</span>{' '}
              <span
                className={`rounded-full px-2 py-1 text-xs font-bold ${
                  device.status === 'online' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700'
                }`}
              >
                {device.status}
              </span>
            </p>
            <p><span className="font-semibold text-slate-700">Added Time:</span> {formatTime(device.addedAt)}</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="mb-2 text-sm font-semibold text-slate-700">Trash Level: {device.trashLevel}%</p>
            <div className="h-2 w-full rounded-full bg-slate-200">
              <div
                className={`h-2 rounded-full ${
                  device.trashLevel >= 80 ? 'bg-red-500' : device.trashLevel >= 50 ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
                style={{ width: `${device.trashLevel}%` }}
              />
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => pushToast('Device updated successfully (UI demo).', 'success')}
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
      </Surface>

      {isDeletePopupOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <h2 className="text-lg font-bold text-slate-900">Delete Device</h2>
            <p className="mt-2 text-sm text-slate-600">
              Confirm deleting {device.name} ({device.macAddress})?
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
                onClick={() => {
                  setIsDeletePopupOpen(false);
                  pushToast('Device deleted (UI demo).', 'success');
                }}
                variant="danger"
              >
                Confirm Delete
              </Button>
            </div>
          </div>
        </div>
      )}

      <ToastStack toasts={toasts} />
    </div>
  );
}

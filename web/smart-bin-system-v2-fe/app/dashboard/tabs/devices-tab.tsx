'use client';

import Link from 'next/link';
import DeviceMap from '@/components/layout/map';
import { Button } from '@/components/ui/button';
import { DeviceDto } from '@/types/device';

export type DeviceTelemetrySummary = {
  fillLevel: number | null;
  thrownCount: number | null;
  sampledAt: number | null;
};

type DevicesTabProps = {
  hasDevices: boolean;
  isDeviceLoading: boolean;
  devices: DeviceDto[];
  selectedDeviceId: string | null;
  selectedDevice: DeviceDto | null;
  selectedDeviceTelemetry: DeviceTelemetrySummary;
  formatTime: (value: string) => string;
  onSelectDevice: (id: string | null) => void;
  onOpenAddDevice: () => void;
  onOpenEditDevice: () => void;
  onOpenDeleteDevice: () => void;
};

export default function DevicesTab({
  hasDevices,
  isDeviceLoading,
  devices,
  selectedDeviceId,
  selectedDevice,
  selectedDeviceTelemetry,
  formatTime,
  onSelectDevice,
  onOpenAddDevice,
  onOpenEditDevice,
  onOpenDeleteDevice,
}: DevicesTabProps) {
  if (!hasDevices) {
    return (
      <div className="flex w-full items-center justify-center rounded-2xl border border-slate-200 bg-white p-6 md:p-10">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Welcome to Smart Bin</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
            Keep your city cleaner with smart, connected bins.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-slate-600 md:text-base">
            Add your first device to start monitoring fill levels, improving collection efficiency, and getting actionable insights in real time.
          </p>

          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button type="button" size="lg" onClick={onOpenAddDevice}>
              Add Your First Device
            </Button>
            <p className="text-xs text-slate-500">MAC format: AA:BB:CC:DD:EE:FF</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {!selectedDevice && (
        <aside className="h-80 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:h-full lg:w-[30%]">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-lg font-bold text-slate-900">Your Devices</h2>
            <p className="text-sm text-slate-500">Select a card to view details on the right.</p>
          </div>

          <div className="h-[calc(100%-4.25rem)] space-y-3 overflow-y-auto p-3">
            {isDeviceLoading && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">Loading devices...</div>
            )}

            {!isDeviceLoading && devices.map((device) => (
              <button
                key={device.id}
                type="button"
                onClick={() => onSelectDevice(device.id)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-3 text-left transition hover:border-emerald-300 hover:bg-emerald-50"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-slate-900">{device.name}</p>
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-bold ${
                      device.status === 'ONLINE' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {device.status === 'ONLINE' ? 'online' : 'offline'}
                  </span>
                </div>
                <p className="mt-2 text-xs font-medium tracking-wide text-slate-500">MAC: {device.mac}</p>
              </button>
            ))}
          </div>
        </aside>
      )}

      <div className={`relative h-105 min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white lg:h-full ${selectedDevice ? 'w-full lg:w-[60%]' : 'w-full lg:flex-1'}`}>
        <DeviceMap
          devices={devices}
          selectedDeviceId={selectedDeviceId}
          onSelectDevice={onSelectDevice}
          className="h-full w-full"
        />

        {selectedDevice && (
          <button
            type="button"
            onClick={() => onSelectDevice(null)}
            className="absolute left-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/70 bg-white/90 text-slate-700 shadow-sm transition hover:bg-white"
            aria-label="Back to map overview"
            title="Back to map overview"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        )}

        <div className={`absolute top-3 rounded-md bg-black/40 px-3 py-1 text-xs font-semibold text-white ${selectedDevice ? 'left-14' : 'left-3'}`}>
          Click a marker or device card
        </div>
      </div>

      {selectedDevice && (
        <aside className="h-80 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:h-full lg:w-[40%]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Device Detail</p>
              <h3 className="text-xl font-bold text-slate-900">{selectedDevice.name}</h3>
            </div>

            <button
              type="button"
              onClick={() => onSelectDevice(null)}
              className="rounded-xl border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              Close
            </button>
          </div>

          <div className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
            <p><span className="font-semibold text-slate-700">Name:</span> {selectedDevice.name}</p>
            <p><span className="font-semibold text-slate-700">MAC Address:</span> {selectedDevice.mac}</p>
            <p>
              <span className="font-semibold text-slate-700">Location:</span> {selectedDevice.longitude.toFixed(6)}, {selectedDevice.latitude.toFixed(6)}
            </p>
            <p>
              <span className="font-semibold text-slate-700">Status:</span>{' '}
              <span
                className={`rounded-full px-2 py-1 text-xs font-bold ${
                  selectedDevice.status === 'ONLINE' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700'
                }`}
              >
                {selectedDevice.status === 'ONLINE' ? 'online' : 'offline'}
              </span>
            </p>
            <p><span className="font-semibold text-slate-700">Added Time:</span> {formatTime(selectedDevice.createdDate)}</p>
            <div>
              <p className="mb-2 font-semibold text-slate-700">
                Trash Level: {selectedDeviceTelemetry.fillLevel !== null ? `${selectedDeviceTelemetry.fillLevel}%` : 'N/A'}
              </p>
              <div className="h-2 w-full rounded-full bg-slate-200">
                <div
                  className={`h-2 rounded-full ${
                    (selectedDeviceTelemetry.fillLevel ?? 0) >= 80
                      ? 'bg-red-500'
                      : (selectedDeviceTelemetry.fillLevel ?? 0) >= 50
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                  }`}
                  style={{ width: `${selectedDeviceTelemetry.fillLevel ?? 0}%` }}
                />
              </div>
            </div>
            <p>
              <span className="font-semibold text-slate-700">Waste Throws:</span> {selectedDeviceTelemetry.thrownCount ?? 'N/A'}
            </p>
            <p>
              <span className="font-semibold text-slate-700">Last Telemetry:</span>{' '}
              {selectedDeviceTelemetry.sampledAt
                ? formatTime(new Date(selectedDeviceTelemetry.sampledAt).toISOString())
                : 'N/A'}
            </p>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={`/dashboard/devices/${selectedDevice.id}`}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              Open Full Detail Page
            </Link>

            <button
              type="button"
              onClick={onOpenEditDevice}
              className="rounded-xl bg-amber-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-amber-600"
            >
              Edit Device
            </button>

            <button
              type="button"
              onClick={onOpenDeleteDevice}
              className="rounded-xl bg-rose-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-rose-700"
            >
              Delete Device
            </button>
          </div>
        </aside>
      )}
    </>
  );
}

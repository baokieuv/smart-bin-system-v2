"use client";

import { FormEvent, useEffect, useState } from "react";
import Panel from "@/components/ui/panel";
import { unwrapListPayload } from "@/lib/admin-utils";
import { devicesAdminApi } from "@/services/api/devices-admin";
import ImportDevicesPanel from "@/components/devices/import-devices";
import type { DeviceDto } from "@/types/device";

export default function DevicesPage() {
  const [devices, setDevices] = useState<DeviceDto[]>([]);
  const [form, setForm] = useState({ name: "", mac: "" });
  const [message, setMessage] = useState("");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);

  const load = async (nextPage = page, nextSize = size) => {
    const response = await devicesAdminApi.getDevices({ page: nextPage, size: nextSize });
    setDevices(unwrapListPayload(response.data));

    if (!Array.isArray(response.data) && response.data) {
      const payload = response.data as Record<string, unknown>;
      const backendTotalPages = payload.totalPages;
      if (typeof backendTotalPages === "number" && Number.isFinite(backendTotalPages)) {
        setTotalPages(Math.max(1, backendTotalPages));
      }
    }
  };

  useEffect(() => {
    void load(page, size);
  }, [page, size]);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await devicesAdminApi.importDevices({ devices: [{ name: form.name, mac: form.mac }] });
      setForm({ name: "", mac: "" });
      setMessage("Imported 1 device");
      await load(page, size);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import failed");
    }
  };

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
      <Panel title="Devices" subtitle="Admin device list with server pagination">
        <div className="max-w-full overflow-x-auto">
          <table className="w-full min-w-300 text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                <th className="py-2 whitespace-nowrap">Name</th>
                <th className="py-2 whitespace-nowrap">MAC</th>
                <th className="py-2 whitespace-nowrap">Access Token</th>
                <th className="py-2 whitespace-nowrap">Status</th>
                <th className="py-2 whitespace-nowrap">State</th>
                <th className="py-2 whitespace-nowrap">Latitude</th>
                <th className="py-2 whitespace-nowrap">Longitude</th>
                <th className="py-2 whitespace-nowrap">Desktop Ver</th>
                <th className="py-2 whitespace-nowrap">Bin Ver</th>
                <th className="py-2 whitespace-nowrap">Claimed At</th>
                <th className="py-2 whitespace-nowrap">Created Date</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((device) => (
                <tr key={device.id} className="border-b border-slate-200/70">
                  <td className="py-2 font-medium text-foreground whitespace-nowrap">{device.name}</td>
                  <td className="py-2 text-slate-600 whitespace-nowrap">{device.mac}</td>
                  <td className="py-2 text-slate-600 whitespace-nowrap">
                    <div className="max-w-55 overflow-x-auto whitespace-nowrap">{device.accessToken || "-"}</div>
                  </td>
                  <td className="py-2 text-slate-600 whitespace-nowrap">{device.status}</td>
                  <td className="py-2 text-slate-600 whitespace-nowrap">{device.state || "-"}</td>
                  <td className="py-2 text-slate-600 whitespace-nowrap">{device.latitude ?? "-"}</td>
                  <td className="py-2 text-slate-600 whitespace-nowrap">{device.longitude ?? "-"}</td>
                  <td className="py-2 text-slate-600 whitespace-nowrap">{device.desktopVersion || "-"}</td>
                  <td className="py-2 text-slate-600 whitespace-nowrap">{device.binVersion || "-"}</td>
                  <td className="py-2 text-slate-600 whitespace-nowrap">{device.claimedAt ?? "-"}</td>
                  <td className="py-2 text-slate-600 whitespace-nowrap">{device.createdDate || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
          <div className="text-slate-600">Page {page} / {totalPages}</div>
          <div className="flex items-center gap-2">
            <select
              className="rounded-lg border border-slate-200 px-2 py-1"
              value={size}
              onChange={(e) => {
                setPage(1);
                setSize(Number(e.target.value));
              }}
            >
              <option value={10}>10 / page</option>
              <option value={20}>20 / page</option>
              <option value={50}>50 / page</option>
              <option value={100}>100 / page</option>
            </select>
            <button
              className="rounded-lg border border-slate-200 px-3 py-1 disabled:opacity-50"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              type="button"
            >
              Prev
            </button>
            <button
              className="rounded-lg border border-slate-200 px-3 py-1 disabled:opacity-50"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              type="button"
            >
              Next
            </button>
          </div>
        </div>
      </Panel>

      <div className="space-y-4">
        <Panel title="Import Devices">
          <ImportDevicesPanel onImported={() => void load(page, size)} />
        </Panel>

        <Panel title="Quick Add (uses import API)">
          <form onSubmit={create} className="space-y-3">
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
              placeholder="Device name"
              value={form.name}
              onChange={(event) => setForm((v) => ({ ...v, name: event.target.value }))}
              required
            />
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
              placeholder="MAC address"
              value={form.mac}
              onChange={(event) => setForm((v) => ({ ...v, mac: event.target.value }))}
              required
            />
            <div className="flex items-center gap-2">
              <button className="rounded-xl bg-sky-800 px-4 py-2 text-sm font-semibold text-white" type="submit">
                Add 1 device via import
              </button>
              {message ? <p className="text-sm text-slate-600">{message}</p> : null}
            </div>
          </form>
        </Panel>
      </div>
    </div>
  );
}


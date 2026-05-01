"use client";

import { FormEvent, useEffect, useState } from "react";
import Panel from "@/components/ui/panel";
import { unwrapListPayload } from "@/lib/admin-utils";
import { devicesAdminApi } from "@/services/api/devices-admin";
import type { DeviceDto } from "@/types/device";

export default function DevicesPage() {
  const [devices, setDevices] = useState<DeviceDto[]>([]);
  const [form, setForm] = useState({ name: "", mac: "", latitude: "", longitude: "" });
  const [message, setMessage] = useState("");

  const load = async () => {
    const response = await devicesAdminApi.getDevices();
    setDevices(unwrapListPayload(response.data));
  };

  useEffect(() => {
    void load();
  }, []);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await devicesAdminApi.createDevice({
        name: form.name,
        mac: form.mac,
        latitude: Number(form.latitude),
        longitude: Number(form.longitude),
      });
      setForm({ name: "", mac: "", latitude: "", longitude: "" });
      setMessage("Device created");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Create failed");
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
      <Panel title="Devices" subtitle="Maps from user dashboard device management">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                <th className="py-2">Name</th>
                <th className="py-2">MAC</th>
                <th className="py-2">Status</th>
                <th className="py-2">State</th>
                <th className="py-2">Location</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((device) => (
                <tr key={device.id} className="border-b border-slate-200/70">
                  <td className="py-2 font-medium text-foreground">{device.name}</td>
                  <td className="py-2 text-slate-600">{device.mac}</td>
                  <td className="py-2 text-slate-600">{device.status}</td>
                  <td className="py-2 text-slate-600">{device.state}</td>
                  <td className="py-2 text-slate-600">{device.latitude}, {device.longitude}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Add Device">
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
          <div className="grid grid-cols-2 gap-3">
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
              placeholder="Latitude"
              value={form.latitude}
              onChange={(event) => setForm((v) => ({ ...v, latitude: event.target.value }))}
              required
            />
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
              placeholder="Longitude"
              value={form.longitude}
              onChange={(event) => setForm((v) => ({ ...v, longitude: event.target.value }))}
              required
            />
          </div>
          <button className="rounded-xl bg-sky-800 px-4 py-2 text-sm font-semibold text-white" type="submit">
            Add device
          </button>
          {message ? <p className="text-sm text-slate-600">{message}</p> : null}
        </form>
      </Panel>
    </div>
  );
}


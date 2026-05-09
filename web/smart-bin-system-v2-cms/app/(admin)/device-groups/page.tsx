"use client";

import { FormEvent, useEffect, useState } from "react";
import Panel from "@/components/ui/panel";
import { unwrapListPayload } from "@/lib/admin-utils";
import { deviceGroupsAdminApi } from "@/services/api/device-groups-admin";
import type { DeviceGroupDto } from "@/types/device-group";

export default function DeviceGroupsPage() {
  const [items, setItems] = useState<DeviceGroupDto[]>([]);
  const [form, setForm] = useState({ code: "", name: "", binHeight: "", description: "" });
  const [message, setMessage] = useState("");

  const load = async () => {
    const response = await deviceGroupsAdminApi.getDeviceGroups({ page: 1, size: 100 });
    setItems(unwrapListPayload(response.data));
  };

  useEffect(() => {
    void load().catch((error) => {
      setMessage(error instanceof Error ? error.message : "Load failed");
    });
  }, []);

  const createDeviceGroup = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");

    const parsedBinHeight = Number(form.binHeight);
    if (!Number.isFinite(parsedBinHeight) || parsedBinHeight <= 0) {
      setMessage("Bin height must be greater than 0");
      return;
    }

    try {
      await deviceGroupsAdminApi.createDeviceGroup({
        code: form.code.trim(),
        name: form.name.trim(),
        binHeight: parsedBinHeight,
        description: form.description.trim() || undefined,
      });
      setForm({ code: "", name: "", binHeight: "", description: "" });
      setMessage("Device group created");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Create failed");
    }
  };

  const remove = async (id: string) => {
    try {
      await deviceGroupsAdminApi.deleteDeviceGroup(id);
      setMessage("Device group deleted");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Delete failed");
    }
  };

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
      <Panel title="Device Groups" subtitle="Configure physical bin groups for device assignment">
        <div className="overflow-x-auto">
          <table className="w-full min-w-180 text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                <th className="py-2">Code</th>
                <th className="py-2">Name</th>
                <th className="py-2">Bin Height (cm)</th>
                <th className="py-2">Description</th>
                <th className="py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-slate-200/70">
                  <td className="py-2 font-medium text-foreground">{item.code}</td>
                  <td className="py-2 text-slate-600">{item.name}</td>
                  <td className="py-2 text-slate-600">{item.binHeight}</td>
                  <td className="py-2 text-slate-600">{item.description || "-"}</td>
                  <td className="py-2">
                    <button
                      type="button"
                      onClick={() => void remove(item.id)}
                      className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="space-y-4">
        <Panel title="New Device Group">
          <form onSubmit={createDeviceGroup} className="space-y-3">
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
              placeholder="Code (e.g. SMART_BIN_60L_V1)"
              value={form.code}
              onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value }))}
              required
            />
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
              placeholder="Name"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              required
            />
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
              placeholder="Bin height (cm)"
              value={form.binHeight}
              onChange={(event) => setForm((prev) => ({ ...prev, binHeight: event.target.value }))}
              required
              type="number"
              min="0.01"
              step="0.01"
            />
            <textarea
              className="h-28 w-full rounded-xl border border-slate-200 px-3 py-2"
              placeholder="Description"
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
            />
            <button className="rounded-xl bg-sky-800 px-4 py-2 text-sm font-semibold text-white" type="submit">
              Create device group
            </button>
            {message ? <p className="text-sm text-slate-600">{message}</p> : null}
          </form>
        </Panel>
      </div>
    </div>
  );
}

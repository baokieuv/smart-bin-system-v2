"use client";

import { FormEvent, useEffect, useState } from "react";
import Panel from "@/components/ui/panel";
import { unwrapListPayload } from "@/lib/admin-utils";
import { deviceGroupsAdminApi } from "@/services/api/device-groups-admin";
import type { DeviceGroupDto } from "@/types/device-group";

export default function DeviceGroupsPage() {
  const [items, setItems] = useState<DeviceGroupDto[]>([]);
  const [form, setForm] = useState({ code: "", name: "", sharedSpecsJson: "{}", description: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
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

  const saveDeviceGroup = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");

    let parsedSpecs: Record<string, unknown>;
    try {
      parsedSpecs = JSON.parse(form.sharedSpecsJson || "{}");
    } catch {
      setMessage("Invalid JSON for shared specs");
      return;
    }

    try {
      if (editingId) {
        await deviceGroupsAdminApi.updateDeviceGroup(editingId, {
          code: form.code.trim(),
          name: form.name.trim(),
          metadata: parsedSpecs,
          description: form.description.trim() || undefined,
        });
        setMessage("Device group updated");
      } else {
        await deviceGroupsAdminApi.createDeviceGroup({
          code: form.code.trim(),
          name: form.name.trim(),
          metadata: parsedSpecs,
          description: form.description.trim() || undefined,
        });
        setMessage("Device group created");
      }

      setForm({ code: "", name: "", sharedSpecsJson: "{}", description: "" });
      setEditingId(null);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed");
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
      <Panel title="Device Groups" subtitle="Admin-managed groups for assigning one or many devices">
        <div className="overflow-x-auto">
          <table className="w-full min-w-180 text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                <th className="py-2 px-3">Code</th>
                <th className="py-2 px-3">Name</th>
                  <th className="py-2 px-3">Shared Specs</th>
                <th className="py-2 px-3">Description</th>
                <th className="py-2 px-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-slate-200/70">
                  <td className="py-2 px-3 font-medium text-foreground">{item.code}</td>
                  <td className="py-2 px-3 text-slate-600">{item.name}</td>
                  <td className="py-2 px-3 text-slate-600">
                    <div className="max-w-md max-h-20 overflow-auto whitespace-pre-wrap wrap-break-word">{JSON.stringify(item.metadata ?? {})}</div>
                  </td>
                  <td className="py-2 px-3 text-slate-600">
                    <div className="max-w-md max-h-20 overflow-auto whitespace-pre-wrap wrap-break-word">{item.description || "-"}</div>
                  </td>
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(item.id);
                          setForm({ code: item.code, name: item.name, sharedSpecsJson: JSON.stringify(item.metadata ?? {}, null, 2), description: item.description || "" });
                        }}
                        className="rounded-lg bg-slate-100 px-2 py-1 text-sm"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void remove(item.id)}
                        className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="space-y-4">
        <Panel title="New Device Group">
          <form onSubmit={saveDeviceGroup} className="space-y-3">
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
            <label className="block text-sm text-slate-600">Shared specs (JSON)</label>
            <textarea
              className="h-28 w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm"
              placeholder='{"width":20, "height":30, "color":"blue"}'
              value={form.sharedSpecsJson}
              onChange={(event) => setForm((prev) => ({ ...prev, sharedSpecsJson: event.target.value }))}
              required
            />
            <textarea
              className="h-28 w-full rounded-xl border border-slate-200 px-3 py-2"
              placeholder="Description"
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
            />
            <div className="flex gap-2">
              <button className="rounded-xl bg-sky-800 px-4 py-2 text-sm font-semibold text-white" type="submit">
                {editingId ? "Update device group" : "Create device group"}
              </button>
              {editingId ? (
                <button
                  type="button"
                  className="rounded-xl bg-slate-100 px-4 py-2 text-sm"
                  onClick={() => {
                    setEditingId(null);
                    setForm({ code: "", name: "", sharedSpecsJson: "{}", description: "" });
                    setMessage("");
                  }}
                >
                  Cancel
                </button>
              ) : null}
            </div>
            {message ? <p className="text-sm text-slate-600">{message}</p> : null}
          </form>
        </Panel>
      </div>
    </div>
  );
}

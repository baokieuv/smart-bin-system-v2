"use client";

import { FormEvent, useEffect, useState } from "react";
import Panel from "@/components/ui/panel";
import { unwrapListPayload } from "@/lib/admin-utils";
import { deviceProfilesAdminApi } from "@/services/api/device-profiles-admin";
import type { DeviceProfileDto } from "@/types/device-profile";

export default function DeviceProfilesPage() {
  const [items, setItems] = useState<DeviceProfileDto[]>([]);
  const [form, setForm] = useState({ code: "", name: "", sharedSpecsJson: "{}", description: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const load = async () => {
    const response = await deviceProfilesAdminApi.getDeviceProfiles({ page: 1, size: 100 });
    setItems(unwrapListPayload(response.data));
  };

  const resetForm = () => {
    setForm({ code: "", name: "", sharedSpecsJson: "{}", description: "" });
    setEditingId(null);
  };

  const saveProfile = async (event: FormEvent) => {
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
        await deviceProfilesAdminApi.updateDeviceProfile(editingId, {
          code: form.code.trim(),
          name: form.name.trim(),
          sharedSpecs: parsedSpecs,
          description: form.description.trim() || undefined,
        });
        setMessage("Device profile updated");
      } else {
        await deviceProfilesAdminApi.createDeviceProfile({
          code: form.code.trim(),
          name: form.name.trim(),
          sharedSpecs: parsedSpecs,
          description: form.description.trim() || undefined,
        });
        setMessage("Device profile created");
      }

      resetForm();
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed");
    }
  };

  const removeProfile = async (id: string) => {
    try {
      await deviceProfilesAdminApi.deleteDeviceProfile(id);
      setMessage("Device profile deleted");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Delete failed");
    }
  };

  useEffect(() => {
    void load().catch((error) => {
      setMessage(error instanceof Error ? error.message : "Load failed");
    });
  }, []);

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
      <Panel title="Device Profiles" subtitle="Super admin CRUD for device catalog profiles">
        <div className="overflow-x-auto">
          <table className="w-full min-w-220 text-left text-sm">
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
                    <div className="max-h-20 max-w-md overflow-auto whitespace-pre-wrap wrap-break-word">
                      {JSON.stringify(item.sharedSpecs ?? {})}
                    </div>
                  </td>
                  <td className="py-2 px-3 text-slate-600">
                    <div className="max-h-20 max-w-md overflow-auto whitespace-pre-wrap wrap-break-word">{item.description || "-"}</div>
                  </td>
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(item.id);
                          setForm({
                            code: item.code,
                            name: item.name,
                            sharedSpecsJson: JSON.stringify(item.sharedSpecs ?? {}, null, 2),
                            description: item.description || "",
                          });
                        }}
                        className="rounded-lg bg-slate-100 px-2 py-1 text-sm"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeProfile(item.id)}
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
        <Panel title="New Device Profile">
          <form onSubmit={saveProfile} className="space-y-3">
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
              placeholder="Code (e.g. SMART_BIN_PROFILE_60L)"
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
                {editingId ? "Update device profile" : "Create device profile"}
              </button>
              {editingId ? (
                <button
                  type="button"
                  className="rounded-xl bg-slate-100 px-4 py-2 text-sm"
                  onClick={() => {
                    resetForm();
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

        <Panel title="Device Profile Notes" subtitle="Super admin can manage the catalog, tenant-side only sees assigned groups">
          <p className="text-sm text-slate-600">
            Device profiles are read and maintained by super admin, while tenants only work with assigned device groups.
          </p>
        </Panel>
      </div>
    </div>
  );
}
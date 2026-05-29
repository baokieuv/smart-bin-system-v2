"use client";

import { FormEvent, useEffect, useState } from "react";
import Panel from "@/components/ui/panel";
import { unwrapListPayload } from "@/lib/admin-utils";
import { firmwareMappingsAdminApi } from "@/services/api/firmware-mappings-admin";
import { firmwaresAdminApi } from "@/services/api/firmwares-admin";
import type { FirmwareMappingDto, UpdateFirmwareMappingRequest } from "@/types/firmware-mapping";
import type { FirmwareDto } from "@/types/firmware";

function JsonModal({ value, onClose, onSave }: { value: string; onClose: () => void; onSave: (json: string) => void }) {
  const [text, setText] = useState(value ?? "");
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    try {
      JSON.parse(text || "{}");
      onSave(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid JSON");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[min(900px,95%)] rounded-xl bg-white p-6 shadow-lg">
        <h3 className="mb-3 text-lg font-semibold">Edit metadata JSON</h3>
        <textarea
          className="h-60 w-full rounded-lg border border-slate-200 p-3 font-mono text-sm"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button className="rounded-xl px-4 py-2" onClick={onClose}>
            Cancel
          </button>
          <button
            className="rounded-xl bg-blue-600 px-4 py-2 text-white"
            onClick={save}
          >
            Save JSON
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FirmwareMappingsPage() {
  const [mappings, setMappings] = useState<FirmwareMappingDto[]>([]);
  const [message, setMessage] = useState("");

  const [firmwares, setFirmwares] = useState<FirmwareDto[]>([]);

  const [form, setForm] = useState({ metadataJson: "{}", targetFirmwareId: "", priority: "0" });
  const [editing, setEditing] = useState<FirmwareMappingDto | null>(null);
  const [showJsonModal, setShowJsonModal] = useState(false);

  const load = async () => {
    try {
      const res = await firmwareMappingsAdminApi.getMappings({ page: 1, size: 200 });
      setMappings(unwrapListPayload(res.data));

      const fwRes = await firmwaresAdminApi.getFirmwares({ page: 1, size: 200 });
      setFirmwares(unwrapListPayload(fwRes.data));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Load failed");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const createOrUpdate = async (e: FormEvent) => {
    e.preventDefault();
    setMessage("");
    try {
      const metadata = JSON.parse(form.metadataJson || "{}");
      if (editing) {
        const request: UpdateFirmwareMappingRequest = {
          metadataCriteria: metadata,
          targetFirmwareId: form.targetFirmwareId,
          priority: Number(form.priority || 0),
          active: editing.active,
        };

        await firmwareMappingsAdminApi.updateMapping(editing.id, request);
        setMessage("Mapping updated");
      } else {
        await firmwareMappingsAdminApi.createMapping({
          metadataCriteria: metadata,
          targetFirmwareId: form.targetFirmwareId,
          priority: Number(form.priority || 0),
        });
        setMessage("Mapping created");
      }
      setForm({ metadataJson: "{}", targetFirmwareId: "", priority: "0" });
      setEditing(null);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    }
  };

  const startEdit = (m: FirmwareMappingDto) => {
    setEditing(m);
    setForm({ metadataJson: JSON.stringify(m.metadataCriteria ?? {}, null, 2), targetFirmwareId: m.targetFirmwareId, priority: String(m.priority ?? 0) });
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this mapping?")) return;
    try {
      await firmwareMappingsAdminApi.deleteMapping(id);
      setMessage("Mapping deleted");
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Delete failed");
    }
  };

  return (
    <div className="space-y-4">
      <Panel title="Firmware Mappings" subtitle="Map device metadata to target firmware">
        <form className="grid gap-4 md:grid-cols-[1fr_200px_120px_auto]" onSubmit={createOrUpdate}>
          <div>
            <label className="block text-sm font-medium text-slate-700">Metadata criteria (JSON)</label>
            <div className="mt-2 flex gap-2">
              <input
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5"
                value={form.metadataJson}
                onChange={(e) => setForm((c) => ({ ...c, metadataJson: e.target.value }))}
                placeholder='{"model":"X100","hardware":"v2"}'
              />
              <button type="button" className="rounded-xl bg-slate-100 px-3" onClick={() => setShowJsonModal(true)}>
                Edit
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Target firmware</label>
            <select
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2.5"
              value={form.targetFirmwareId}
              onChange={(e) => setForm((c) => ({ ...c, targetFirmwareId: e.target.value }))}
            >
              <option value="">-- select firmware --</option>
              {firmwares.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.version} ({f.type})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Priority</label>
            <input className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2.5" value={form.priority} onChange={(e) => setForm((c) => ({ ...c, priority: e.target.value }))} />
          </div>

          <div className="flex items-end gap-2">
            <button type="submit" className="rounded-xl bg-[linear-gradient(120deg,#0b3b62,#176ea5)] px-4 py-2.5 text-sm font-semibold text-white">
              {editing ? "Update mapping" : "Create mapping"}
            </button>
            {editing ? (
              <button type="button" className="rounded-xl px-4 py-2.5" onClick={() => { setEditing(null); setForm({ metadataJson: "{}", targetFirmwareId: "", priority: "0" }); }}>
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      </Panel>

      <Panel title="Mappings List">
        <div className="overflow-x-auto">
          <table className="w-full min-w-240 text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                <th className="py-2">Criteria</th>
                <th className="py-2">Target</th>
                <th className="py-2">Priority</th>
                <th className="py-2">Active</th>
                <th className="py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {mappings.map((m) => (
                <tr key={m.id} className="border-b border-slate-200/70">
                  <td className="py-2 font-medium text-foreground">{JSON.stringify(m.metadataCriteria).slice(0, 100)}</td>
                  <td className="py-2 text-slate-600">{m.targetFirmwareVersion ?? m.targetFirmwareId}</td>
                  <td className="py-2 text-slate-600">{m.priority ?? "-"}</td>
                  <td className="py-2 text-slate-600">{m.active ? "Yes" : "No"}</td>
                  <td className="py-2">
                    <button className="mr-2 rounded-lg bg-slate-100 px-2 py-1" onClick={() => startEdit(m)}>
                      Edit
                    </button>
                    <button className="rounded-lg bg-rose-50 px-2 py-1 text-rose-600" onClick={() => void remove(m.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {message ? <p className="text-sm text-slate-600">{message}</p> : null}

      {showJsonModal ? (
        <JsonModal
          value={form.metadataJson}
          onClose={() => setShowJsonModal(false)}
          onSave={(json) => {
            setForm((c) => ({ ...c, metadataJson: json }));
            setShowJsonModal(false);
          }}
        />
      ) : null}
    </div>
  );
}

"use client";

import { FormEvent, useEffect, useState } from "react";
import Panel from "@/components/ui/panel";
import Modal from "@/components/ui/modal";
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
      setError(e instanceof Error ? e.message : "Oops! The JSON format looks invalid.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[min(900px,95%)] rounded-xl bg-white p-6 shadow-lg">
        <h3 className="mb-3 text-lg font-semibold">Edit JSON Configuration</h3>
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
            Save Configuration
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
  const [showEditorModal, setShowEditorModal] = useState(false);
  const [showJsonModal, setShowJsonModal] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [deleteLoadingId, setDeleteLoadingId] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await firmwareMappingsAdminApi.getMappings({ page: 1, size: 200 });
      setMappings(unwrapListPayload(res.data));

      const fwRes = await firmwaresAdminApi.getFirmwares({ page: 1, size: 200 });
      setFirmwares(unwrapListPayload(fwRes.data));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "We couldn't load the firmware data at the moment.");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const createOrUpdate = async (e: FormEvent) => {
    e.preventDefault();
    setMessage("");
    setSaveLoading(true);
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
        setMessage("InnoEco routing rule updated successfully!");
      } else {
        await firmwareMappingsAdminApi.createMapping({
          metadataCriteria: metadata,
          targetFirmwareId: form.targetFirmwareId,
          priority: Number(form.priority || 0),
        });
        setMessage("New InnoEco routing rule created successfully!");
      }
      setForm({ metadataJson: "{}", targetFirmwareId: "", priority: "0" });
      setEditing(null);
      setShowEditorModal(false);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "We couldn't save your routing rule right now.");
    } finally {
      setSaveLoading(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ metadataJson: "{}", targetFirmwareId: "", priority: "0" });
    setMessage("");
    setShowEditorModal(true);
  };

  const startEdit = (m: FirmwareMappingDto) => {
    setEditing(m);
    setForm({ metadataJson: JSON.stringify(m.metadataCriteria ?? {}, null, 2), targetFirmwareId: m.targetFirmwareId, priority: String(m.priority ?? 0) });
    setMessage("");
    setShowEditorModal(true);
  };

  const closeEditorModal = () => {
    setShowEditorModal(false);
    setEditing(null);
    setForm({ metadataJson: "{}", targetFirmwareId: "", priority: "0" });
  };

  const remove = async (id: string) => {
    if (!confirm("Are you sure you want to remove this update rule?")) return;
    try {
      setDeleteLoadingId(id);
      await firmwareMappingsAdminApi.deleteMapping(id);
      setMessage("Routing rule removed successfully!");
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "We couldn't remove this rule right now.");
    } finally {
      setDeleteLoadingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <Panel
        title="InnoEco Firmware Routing"
        subtitle="Seamlessly route the correct firmware updates to your deployed InnoEco devices"
        action={
          <button type="button" className="rounded-xl bg-[linear-gradient(120deg,#0b3b62,#176ea5)] px-3 py-2 text-xs font-semibold text-white" onClick={openCreate}>
            Create Routing Rule
          </button>
        }
      >
        <p className="text-sm text-slate-600">Use the popup editor to easily set up or modify your firmware routing configurations in a clean JSON format.</p>
      </Panel>

      <Panel title="Active Routing Rules">
        <div className="overflow-x-auto">
          <table className="w-full min-w-240 text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                <th className="py-2">Matching Criteria</th>
                <th className="py-2">Target Firmware</th>
                <th className="py-2">Priority</th>
                <th className="py-2">Active</th>
                <th className="py-2">Actions</th>
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
                    <button className="rounded-lg bg-rose-50 px-2 py-1 text-rose-600" onClick={() => void remove(m.id)} disabled={deleteLoadingId === m.id}>
                      {deleteLoadingId === m.id ? "Deleting..." : "Delete"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {message ? <p className="text-sm text-slate-600">{message}</p> : null}

      {showEditorModal ? (
        <Modal
          title={editing ? "Update Routing Rule" : "Create Routing Rule"}
          subtitle="Adjust the matching criteria, target firmware, and priority level"
          onClose={closeEditorModal}
        >
          <form className="grid gap-4 md:grid-cols-[1fr_200px_120px]" onSubmit={createOrUpdate}>
            <div>
              <label className="block text-sm font-medium text-slate-700">Device Matching Criteria (JSON)</label>
              <div className="mt-2 flex gap-2">
                <input
                  className="w-full rounded-xl border border-slate-300 px-4 py-2.5"
                  value={form.metadataJson}
                  onChange={(e) => setForm((c) => ({ ...c, metadataJson: e.target.value }))}
                  placeholder='{"model":"INNOECO_X100","hardware":"v2"}'
                />
                <button type="button" className="rounded-xl bg-slate-100 px-3" onClick={() => setShowJsonModal(true)}>
                  Edit
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Target Firmware</label>
              <select
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2.5"
                value={form.targetFirmwareId}
                onChange={(e) => setForm((c) => ({ ...c, targetFirmwareId: e.target.value }))}
              >
                <option value="">-- Select an update --</option>
                {firmwares.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.version} ({f.type})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Priority Level</label>
              <input className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2.5" value={form.priority} onChange={(e) => setForm((c) => ({ ...c, priority: e.target.value }))} />
            </div>

            <div className="md:col-span-3 flex items-center gap-2 border-t border-slate-200 pt-4">
              <button type="submit" disabled={saveLoading} className="rounded-xl bg-[linear-gradient(120deg,#0b3b62,#176ea5)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
                {saveLoading ? "Saving..." : editing ? "Update Rule" : "Create Rule"}
              </button>
              <button type="button" className="rounded-xl px-4 py-2.5" onClick={closeEditorModal}>
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

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
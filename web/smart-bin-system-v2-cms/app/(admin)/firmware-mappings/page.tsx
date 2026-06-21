"use client";

import { FormEvent, useEffect, useState } from "react";
import Panel from "@/components/ui/panel";
import Modal from "@/components/ui/modal";
import { unwrapListPayload } from "@/lib/admin-utils";
import { firmwareMappingsAdminApi } from "@/services/api/firmware-mappings-admin";
import { firmwaresAdminApi } from "@/services/api/firmwares-admin";
import { useLanguage } from "@/lib/language"; // IMPORT HOOK NGÔN NGỮ
import type { FirmwareMappingDto, UpdateFirmwareMappingRequest } from "@/types/firmware-mapping";
import type { FirmwareDto } from "@/types/firmware";

function JsonModal({ value, onClose, onSave }: { value: string; onClose: () => void; onSave: (json: string) => void }) {
  const { t } = useLanguage();
  const [text, setText] = useState(value ?? "");
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    try {
      JSON.parse(text || "{}");
      onSave(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : (t as any)("jsonFormatInvalid"));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[min(900px,95%)] rounded-xl bg-white p-6 shadow-lg">
        <h3 className="mb-3 text-lg font-semibold">{(t as any)("editJsonConfig")}</h3>
        <textarea
          className="h-60 w-full rounded-lg border border-slate-200 p-3 font-mono text-sm outline-none focus:border-sky-500 transition"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button className="rounded-xl bg-slate-100 px-4 py-2 hover:bg-slate-200 transition" onClick={onClose}>
            {t("cancel")}
          </button>
          <button
            className="rounded-xl bg-[linear-gradient(120deg,#0b3b62,#176ea5)] px-4 py-2 text-white shadow-md hover:brightness-110 transition"
            onClick={save}
          >
            {(t as any)("saveConfig")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FirmwareMappingsPage() {
  const { t } = useLanguage();
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
      setMessage(err instanceof Error ? err.message : (t as any)("loadFirmwareDataError"));
    }
  };

  useEffect(() => {
    void load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
        setMessage((t as any)("ruleUpdatedSuccess"));
      } else {
        await firmwareMappingsAdminApi.createMapping({
          metadataCriteria: metadata,
          targetFirmwareId: form.targetFirmwareId,
          priority: Number(form.priority || 0),
        });
        setMessage((t as any)("ruleCreatedSuccess"));
      }
      setForm({ metadataJson: "{}", targetFirmwareId: "", priority: "0" });
      setEditing(null);
      setShowEditorModal(false);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : (t as any)("ruleSaveError"));
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
    if (!confirm((t as any)("confirmRemoveRule"))) return;
    try {
      setDeleteLoadingId(id);
      await firmwareMappingsAdminApi.deleteMapping(id);
      setMessage((t as any)("ruleRemovedSuccess"));
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : (t as any)("ruleRemoveError"));
    } finally {
      setDeleteLoadingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <Panel
        title={(t as any)("firmwareRoutingTitle")}
        subtitle={(t as any)("firmwareRoutingSubtitle")}
        action={
          <button type="button" className="rounded-xl bg-[linear-gradient(120deg,#0b3b62,#176ea5)] px-3 py-2 text-xs font-semibold text-white shadow-md hover:brightness-110 transition" onClick={openCreate}>
            {(t as any)("createRoutingRule")}
          </button>
        }
      >
        <p className="text-sm text-slate-600">{(t as any)("firmwareRoutingDesc")}</p>
      </Panel>

      <Panel title={(t as any)("activeRoutingRules")}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-240 text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                <th className="py-2">{(t as any)("matchingCriteria")}</th>
                <th className="py-2">{(t as any)("targetFirmware")}</th>
                <th className="py-2">{(t as any)("priority")}</th>
                <th className="py-2">{(t as any)("activeStatus")}</th>
                <th className="py-2">{(t as any)("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {mappings.map((m) => (
                <tr key={m.id} className="border-b border-slate-200/70">
                  <td className="py-2 font-medium text-foreground">{JSON.stringify(m.metadataCriteria).slice(0, 100)}</td>
                  <td className="py-2 text-slate-600">{m.targetFirmwareVersion ?? m.targetFirmwareId}</td>
                  <td className="py-2 text-slate-600">{m.priority ?? "-"}</td>
                  <td className="py-2 text-slate-600">{m.active ? (t as any)("yes") : (t as any)("no")}</td>
                  <td className="py-2">
                    <button className="mr-2 rounded-lg bg-slate-100 px-2 py-1 hover:bg-slate-200 transition" onClick={() => startEdit(m)}>
                      {(t as any)("editBtn")}
                    </button>
                    <button className="rounded-lg bg-rose-50 px-2 py-1 text-rose-600 hover:bg-rose-100 transition disabled:opacity-50" onClick={() => void remove(m.id)} disabled={deleteLoadingId === m.id}>
                      {deleteLoadingId === m.id ? (t as any)("deleting") : (t as any)("deleteBtn")}
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
          title={editing ? (t as any)("updateRoutingRule") : (t as any)("createRoutingRule")}
          subtitle={(t as any)("routingModalSubtitle")}
          onClose={closeEditorModal}
        >
          <form className="grid gap-4 md:grid-cols-[1fr_200px_120px]" onSubmit={createOrUpdate}>
            <div>
              <label className="block text-sm font-medium text-slate-700">{(t as any)("deviceMatchingCriteria")}</label>
              <div className="mt-2 flex gap-2">
                <input
                  className="w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none focus:border-sky-500 transition font-mono text-sm"
                  value={form.metadataJson}
                  onChange={(e) => setForm((c) => ({ ...c, metadataJson: e.target.value }))}
                  placeholder='{"model":"INNOECO_X100","hardware":"v2"}'
                />
                <button type="button" className="rounded-xl bg-slate-100 px-3 hover:bg-slate-200 transition" onClick={() => setShowJsonModal(true)}>
                  {(t as any)("editBtn")}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">{(t as any)("targetFirmware")}</label>
              <select
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none focus:border-sky-500 transition"
                value={form.targetFirmwareId}
                onChange={(e) => setForm((c) => ({ ...c, targetFirmwareId: e.target.value }))}
              >
                <option value="">{(t as any)("selectUpdate")}</option>
                {firmwares.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.version} ({f.type})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">{(t as any)("priorityLevel")}</label>
              <input 
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none focus:border-sky-500 transition" 
                value={form.priority} 
                onChange={(e) => setForm((c) => ({ ...c, priority: e.target.value }))} 
              />
            </div>

            <div className="md:col-span-3 flex items-center gap-2 border-t border-slate-200 pt-4">
              <button type="submit" disabled={saveLoading} className="rounded-xl bg-[linear-gradient(120deg,#0b3b62,#176ea5)] px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:brightness-110 transition disabled:opacity-60">
                {saveLoading ? t("saving") : editing ? (t as any)("updateRuleBtn") : (t as any)("createRule")}
              </button>
              <button type="button" className="rounded-xl bg-slate-100 px-4 py-2.5 hover:bg-slate-200 transition" onClick={closeEditorModal}>
                {t("cancel")}
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
"use client";

import { FormEvent, useEffect, useState } from "react";
import Panel from "@/components/ui/panel";
import { unwrapListPayload } from "@/lib/admin-utils";
import { deviceGroupsAdminApi } from "@/services/api/device-groups-admin";
import type { AlarmRuleDto, DeviceGroupDto } from "@/types/device-group";

const alarmSeverities = ["CRITICAL", "MAJOR", "MINOR", "WARNING", "INDETERMINATE"] as const;
const alarmOperators = [
  "EQUAL",
  "NOT_EQUAL",
  "GREATER",
  "LESS",
  "GREATER_OR_EQUAL",
  "LESS_OR_EQUAL",
  "STARTS_WITH",
  "ENDS_WITH",
  "CONTAINS",
  "NOT_CONTAINS",
] as const;

type AlarmRuleFormValue = {
  alarmType: string;
  operator: string;
  threshold: string;
  severity: string;
  clearOperator: string;
  clearThreshold: string;
};

type DeviceGroupFormState = {
  code: string;
  name: string;
  sharedSpecsJson: string;
  description: string;
  alarmRules: AlarmRuleFormValue[];
};

const createEmptyAlarmRule = (): AlarmRuleFormValue => ({
  alarmType: "",
  operator: "EQUAL",
  threshold: "",
  severity: "WARNING",
  clearOperator: "LESS",
  clearThreshold: "",
});

const createBlankForm = (): DeviceGroupFormState => ({
  code: "",
  name: "",
  sharedSpecsJson: "{}",
  description: "",
  alarmRules: [],
});

const normalizeAlarmRules = (alarmRules: AlarmRuleFormValue[]) => {
  const activeRows = alarmRules.filter(
    (rule) =>
      rule.alarmType.trim() ||
      rule.operator.trim() ||
      rule.threshold.trim() ||
      rule.severity.trim() ||
      rule.clearOperator.trim() ||
      rule.clearThreshold.trim(),
  );

  if (!activeRows.length) {
    return [] as AlarmRuleDto[];
  }

  const normalized: AlarmRuleDto[] = [];

  for (const rule of activeRows) {
    if (
      !rule.alarmType.trim() ||
      !rule.operator.trim() ||
      !rule.threshold.trim() ||
      !rule.severity.trim() ||
      !rule.clearOperator.trim() ||
      !rule.clearThreshold.trim()
    ) {
      return { error: "Please complete every alarm rule row or remove the empty row" } as const;
    }

    const threshold = Number(rule.threshold);
    if (!Number.isFinite(threshold)) {
      return { error: `Invalid threshold for alarm ${rule.alarmType || "rule"}` } as const;
    }

    const clearThreshold = Number(rule.clearThreshold);
    if (!Number.isFinite(clearThreshold)) {
      return { error: `Invalid clear threshold for alarm ${rule.alarmType || "rule"}` } as const;
    }

    normalized.push({
      alarmType: rule.alarmType.trim(),
      operator: rule.operator.trim(),
      threshold,
      severity: rule.severity.trim(),
      clearOperator: rule.clearOperator.trim(),
      clearThreshold,
    });
  }

  return normalized;
};

export default function DeviceGroupsPage() {
  const [items, setItems] = useState<DeviceGroupDto[]>([]);
  const [form, setForm] = useState<DeviceGroupFormState>(createBlankForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showEditorModal, setShowEditorModal] = useState(false);
  const [message, setMessage] = useState("");
  const [saveLoading, setSaveLoading] = useState(false);
  const [deleteLoadingId, setDeleteLoadingId] = useState<string | null>(null);

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
    setSaveLoading(true);

    let parsedSpecs: Record<string, unknown>;
    try {
      parsedSpecs = JSON.parse(form.sharedSpecsJson || "{}");
    } catch {
      setMessage("Invalid JSON for shared specs");
      return;
    }

    try {
      const normalizedAlarmRules = normalizeAlarmRules(form.alarmRules);

      if ("error" in normalizedAlarmRules) {
        setMessage(normalizedAlarmRules.error);
        return;
      }

      if (editingId) {
        await deviceGroupsAdminApi.updateDeviceGroup(editingId, {
          code: form.code.trim(),
          name: form.name.trim(),
          metadata: parsedSpecs,
          description: form.description.trim() || undefined,
          alarmRules: normalizedAlarmRules,
        });
        setMessage("Device group updated");
      } else {
        await deviceGroupsAdminApi.createDeviceGroup({
          code: form.code.trim(),
          name: form.name.trim(),
          sharedSpecs: parsedSpecs,
          description: form.description.trim() || undefined,
          alarmRules: normalizedAlarmRules,
        });
        setMessage("Device group created");
      }

      setForm(createBlankForm());
      setEditingId(null);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed");
    } finally {
      setSaveLoading(false);
    }
  };

  const remove = async (id: string) => {
    try {
      setDeleteLoadingId(id);
      await deviceGroupsAdminApi.deleteDeviceGroup(id);
      setMessage("Device group deleted");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Delete failed");
    } finally {
      setDeleteLoadingId(null);
    }
  };

  const openCreateModal = () => {
    setEditingId(null);
    setForm(createBlankForm());
    setMessage("");
    setShowEditorModal(true);
  };

  const openEditModal = (item: DeviceGroupDto) => {
    setEditingId(item.id);
    setForm({
      code: item.code,
      name: item.name,
      sharedSpecsJson: JSON.stringify(item.metadata ?? {}, null, 2),
      description: item.description || "",
      alarmRules: item.alarmRules?.length
        ? item.alarmRules.map((rule) => ({
            alarmType: rule.alarmType,
            operator: rule.operator,
            threshold: String(rule.threshold),
            severity: rule.severity,
                clearOperator: rule.clearOperator,
                clearThreshold: String(rule.clearThreshold),
          }))
        : [],
    });
    setMessage("");
    setShowEditorModal(true);
  };

  const closeEditorModal = () => {
    setShowEditorModal(false);
    setEditingId(null);
    setForm(createBlankForm());
  };

  const updateAlarmRule = (index: number, field: keyof AlarmRuleFormValue, value: string) => {
    setForm((current) => ({
      ...current,
      alarmRules: current.alarmRules.map((rule, ruleIndex) => (ruleIndex === index ? { ...rule, [field]: value } : rule)),
    }));
  };

  const addAlarmRule = () => {
    setForm((current) => ({
      ...current,
      alarmRules: [...current.alarmRules, createEmptyAlarmRule()],
    }));
  };

  const removeAlarmRule = (index: number) => {
    setForm((current) => ({
      ...current,
      alarmRules: current.alarmRules.filter((_, ruleIndex) => ruleIndex !== index),
    }));
  };

  const clearAlarmRules = () => {
    setForm((current) => ({
      ...current,
      alarmRules: [],
    }));
  };

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
      <Panel title="Device Groups" subtitle="Admin-managed groups for assigning one or many devices">
        <div className="overflow-x-auto">
          <table className="w-full min-w-220 text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                <th className="py-2 px-3">Code</th>
                <th className="py-2 px-3">Name</th>
                <th className="py-2 px-3">Shared Specs</th>
                <th className="py-2 px-3">Description</th>
                <th className="py-2 px-3">Alarm Rules</th>
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
                  <td className="py-2 px-3 text-slate-600">
                    <div className="max-w-md max-h-24 overflow-auto whitespace-pre-wrap wrap-break-word">
                      {item.alarmRules?.length ? item.alarmRules.map((rule) => rule.alarmType).filter(Boolean).join(", ") : "-"}
                    </div>
                  </td>
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEditModal(item)}
                        className="rounded-lg bg-slate-100 px-2 py-1 text-sm"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void remove(item.id)}
                        disabled={deleteLoadingId === item.id}
                        className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700"
                      >
                        {deleteLoadingId === item.id ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

        <Panel title="Device Group Editor" subtitle="Open the popup editor to create or update a group, including alarm rules">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="rounded-xl bg-sky-800 px-4 py-2 text-sm font-semibold text-white"
              onClick={openCreateModal}
            >
              Create device group
            </button>
            <p className="text-sm text-slate-600">
              Use the popup editor for all create and update actions so alarm config stays readable.
            </p>
          </div>
        </Panel>

      {showEditorModal ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 px-4 py-8">
          <div className="w-[min(1100px,100%)] rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {editingId ? "Update device group" : "Create device group"}
                </h3>
                <p className="text-sm text-slate-500">Edit code, shared specs, and alarm rules in one popup.</p>
              </div>
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700"
                onClick={closeEditorModal}
              >
                Close
              </button>
            </div>

            <form onSubmit={saveDeviceGroup} className="max-h-[calc(100vh-140px)] overflow-y-auto space-y-5 px-6 py-5">
              <div className="grid gap-4 lg:grid-cols-2">
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
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Shared specs (JSON)</label>
                  <textarea
                    className="mt-2 h-36 w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm"
                    placeholder='{"width":20, "height":30, "color":"blue"}'
                    value={form.sharedSpecsJson}
                    onChange={(event) => setForm((prev) => ({ ...prev, sharedSpecsJson: event.target.value }))}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">Description</label>
                  <textarea
                    className="mt-2 h-36 w-full rounded-xl border border-slate-200 px-3 py-2"
                    placeholder="Description"
                    value={form.description}
                    onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Alarm config</p>
                    <p className="text-xs text-slate-500">
                      Leave this section empty to clear alarm rules. Saved payload will send <span className="font-medium">alarmRules: []</span>.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="rounded-lg border border-sky-200 bg-white px-3 py-1.5 text-xs font-semibold text-sky-700"
                      onClick={addAlarmRule}
                    >
                      Add rule
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                      onClick={clearAlarmRules}
                    >
                      Clear all
                    </button>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {form.alarmRules.length ? (
                    form.alarmRules.map((rule, index) => (
                      <div key={`${index}-${rule.alarmType}-${rule.operator}`} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-slate-700">Rule {index + 1}</p>
                          <button
                            type="button"
                            className="rounded-lg px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                            onClick={() => removeAlarmRule(index)}
                          >
                            Remove
                          </button>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                          <label className="block">
                            <span className="block text-xs font-medium uppercase tracking-wide text-slate-500">alarmType</span>
                            <input
                              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                              value={rule.alarmType}
                              onChange={(event) => updateAlarmRule(index, "alarmType", event.target.value)}
                              placeholder="HIGH_AVERAGE_WASTE"
                            />
                          </label>

                          <label className="block">
                            <span className="block text-xs font-medium uppercase tracking-wide text-slate-500">operator</span>
                            <select
                              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                              value={rule.operator}
                              onChange={(event) => updateAlarmRule(index, "operator", event.target.value)}
                            >
                              {alarmOperators.map((operator) => (
                                <option key={operator} value={operator}>
                                  {operator}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="block">
                            <span className="block text-xs font-medium uppercase tracking-wide text-slate-500">threshold</span>
                            <input
                              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                              value={rule.threshold}
                              onChange={(event) => updateAlarmRule(index, "threshold", event.target.value)}
                              placeholder="80"
                              inputMode="decimal"
                            />
                          </label>

                          <label className="block">
                            <span className="block text-xs font-medium uppercase tracking-wide text-slate-500">severity</span>
                            <select
                              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                              value={rule.severity}
                              onChange={(event) => updateAlarmRule(index, "severity", event.target.value)}
                            >
                              {alarmSeverities.map((severity) => (
                                <option key={severity} value={severity}>
                                  {severity}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="block">
                            <span className="block text-xs font-medium uppercase tracking-wide text-slate-500">clearOperator</span>
                            <select
                              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                              value={rule.clearOperator}
                              onChange={(event) => updateAlarmRule(index, "clearOperator", event.target.value)}
                            >
                              {alarmOperators.map((operator) => (
                                <option key={operator} value={operator}>
                                  {operator}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="block">
                            <span className="block text-xs font-medium uppercase tracking-wide text-slate-500">clearThreshold</span>
                            <input
                              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                              value={rule.clearThreshold}
                              onChange={(event) => updateAlarmRule(index, "clearThreshold", event.target.value)}
                              placeholder="60"
                              inputMode="decimal"
                            />
                          </label>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500">
                      No alarm rules yet. Add one if this device group should raise ThingsBoard alarms.
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4">
                <button className="rounded-xl bg-sky-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" type="submit" disabled={saveLoading}>
                  {saveLoading ? "Saving..." : editingId ? "Update device group" : "Create device group"}
                </button>
                <button type="button" className="rounded-xl bg-slate-100 px-4 py-2 text-sm" onClick={closeEditorModal}>
                  Cancel
                </button>
                {message ? <p className="text-sm text-slate-600">{message}</p> : null}
              </div>
            </form>
          </div>
        </div>
      ) : null}
      {message && !showEditorModal ? <p className="text-sm text-slate-600">{message}</p> : null}
    </div>
  );
}

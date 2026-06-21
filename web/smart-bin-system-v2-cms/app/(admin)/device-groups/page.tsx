"use client";

import { FormEvent, useEffect, useState } from "react";
import Panel from "@/components/ui/panel";
import { unwrapListPayload } from "@/lib/admin-utils";
import { deviceGroupsAdminApi } from "@/services/api/device-groups-admin";
import { useLanguage } from "@/lib/language"; // IMPORT HOOK NGÔN NGỮ
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

// Thêm t vào param để dịch lỗi bên trong
const normalizeAlarmRules = (alarmRules: AlarmRuleFormValue[], t: any) => {
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
      return { error: t("fillAllAlertFields") } as const;
    }

    const threshold = Number(rule.threshold);
    if (!Number.isFinite(threshold)) {
      return { error: t("invalidThreshold").replace("{type}", rule.alarmType || "current") } as const;
    }

    const clearThreshold = Number(rule.clearThreshold);
    if (!Number.isFinite(clearThreshold)) {
      return { error: t("invalidClearThreshold").replace("{type}", rule.alarmType || "current") } as const;
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
  const { t } = useLanguage(); // GỌI HOOK
  
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
      setMessage(error instanceof Error ? error.message : (t as any)("loadDeviceGroupsError"));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveDeviceGroup = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    setSaveLoading(true);

    let parsedSpecs: Record<string, unknown>;
    try {
      parsedSpecs = JSON.parse(form.sharedSpecsJson || "{}");
    } catch {
      setMessage((t as any)("invalidSharedSpecsJson"));
      setSaveLoading(false);
      return;
    }

    try {
      const normalizedAlarmRules = normalizeAlarmRules(form.alarmRules, t as any);

      if ("error" in normalizedAlarmRules) {
        setMessage(normalizedAlarmRules.error);
        setSaveLoading(false);
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
        setMessage((t as any)("groupUpdatedSuccess"));
      } else {
        await deviceGroupsAdminApi.createDeviceGroup({
          code: form.code.trim(),
          name: form.name.trim(),
          sharedSpecs: parsedSpecs,
          description: form.description.trim() || undefined,
          alarmRules: normalizedAlarmRules,
        });
        setMessage((t as any)("groupCreatedSuccess"));
      }

      setForm(createBlankForm());
      setEditingId(null);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : (t as any)("saveGroupError"));
    } finally {
      setSaveLoading(false);
    }
  };

  const remove = async (id: string) => {
    try {
      setDeleteLoadingId(id);
      await deviceGroupsAdminApi.deleteDeviceGroup(id);
      setMessage((t as any)("groupRemovedSuccess"));
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : (t as any)("removeGroupError"));
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
      <Panel title={(t as any)("deviceGroupsTitle")} subtitle={(t as any)("deviceGroupsSubtitle")}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-220 text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                <th className="py-2 px-3">{(t as any)("codeCol")}</th>
                <th className="py-2 px-3">{(t as any)("nameCol")}</th>
                <th className="py-2 px-3">{(t as any)("sharedSpecsCol")}</th>
                <th className="py-2 px-3">{(t as any)("descriptionCol")}</th>
                <th className="py-2 px-3">{(t as any)("alertRulesCol")}</th>
                <th className="py-2 px-3">{(t as any)("actions")}</th>
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
                        className="rounded-lg bg-slate-100 px-2 py-1 text-sm hover:bg-slate-200 transition"
                      >
                        {(t as any)("editBtn")}
                      </button>
                      {!item.isDefault ? (
                        <button
                          type="button"
                          onClick={() => void remove(item.id)}
                          disabled={deleteLoadingId === item.id}
                          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition disabled:opacity-50"
                        >
                          {deleteLoadingId === item.id ? (t as any)("deleting") : (t as any)("deleteBtn")}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

        <Panel title={(t as any)("groupActionsTitle")} subtitle={(t as any)("groupActionsSubtitle")}>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="rounded-xl bg-sky-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
              onClick={openCreateModal}
            >
              {(t as any)("createDeviceGroupBtn")}
            </button>
            <p className="text-sm text-slate-600">
              {(t as any)("deviceGroupDesc")}
            </p>
          </div>
        </Panel>

      {showEditorModal ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 px-4 py-8">
          <div className="w-[min(1100px,100%)] rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {editingId ? (t as any)("updateGroupTitle") : (t as any)("createGroupTitle")}
                </h3>
                <p className="text-sm text-slate-500">{(t as any)("groupModalSubtitle")}</p>
              </div>
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
                onClick={closeEditorModal}
              >
                {(t as any)("closeBtn")}
              </button>
            </div>

            <form onSubmit={saveDeviceGroup} className="max-h-[calc(100vh-140px)] overflow-y-auto space-y-5 px-6 py-5">
              <div className="grid gap-4 lg:grid-cols-2">
                <input
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-sky-500 transition"
                  placeholder={(t as any)("codePlaceholder")}
                  value={form.code}
                  onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value }))}
                  required
                />
                <input
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-sky-500 transition"
                  placeholder={(t as any)("friendlyNamePlaceholder")}
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  required
                />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700">{(t as any)("sharedSpecsJsonLabel")}</label>
                  <textarea
                    className="mt-2 h-36 w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm outline-none focus:border-sky-500 transition"
                    placeholder='{"width":20, "height":30, "color":"blue"}'
                    value={form.sharedSpecsJson}
                    onChange={(event) => setForm((prev) => ({ ...prev, sharedSpecsJson: event.target.value }))}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">{(t as any)("descriptionCol")}</label>
                  <textarea
                    className="mt-2 h-36 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-sky-500 transition"
                    placeholder={(t as any)("descriptionPlaceholder")}
                    value={form.description}
                    onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{(t as any)("alertConfigTitle")}</p>
                    <p className="text-xs text-slate-500">
                      {(t as any)("alertConfigDesc")}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="rounded-lg border border-sky-200 bg-white px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-50 transition"
                      onClick={addAlarmRule}
                    >
                      {(t as any)("addRuleBtn")}
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                      onClick={clearAlarmRules}
                    >
                      {(t as any)("clearAllBtn")}
                    </button>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {form.alarmRules.length ? (
                    form.alarmRules.map((rule, index) => (
                      <div key={`${index}-${rule.alarmType}-${rule.operator}`} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-slate-700">
                            {(t as any)("ruleAlarmNumber").replace("{num}", String(index + 1))}
                          </p>
                          <button
                            type="button"
                            className="rounded-lg px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 transition"
                            onClick={() => removeAlarmRule(index)}
                          >
                            {(t as any)("removeRuleBtn")}
                          </button>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                          <label className="block">
                            <span className="block text-xs font-medium uppercase tracking-wide text-slate-500">{(t as any)("alarmTypeLabel")}</span>
                            <input
                              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500 transition"
                              value={rule.alarmType}
                              onChange={(event) => updateAlarmRule(index, "alarmType", event.target.value)}
                              placeholder="HIGH_AVERAGE_WASTE"
                            />
                          </label>

                          <label className="block">
                            <span className="block text-xs font-medium uppercase tracking-wide text-slate-500">{(t as any)("operatorLabel")}</span>
                            <select
                              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500 transition"
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
                            <span className="block text-xs font-medium uppercase tracking-wide text-slate-500">{(t as any)("thresholdLabel")}</span>
                            <input
                              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500 transition"
                              value={rule.threshold}
                              onChange={(event) => updateAlarmRule(index, "threshold", event.target.value)}
                              placeholder="80"
                              inputMode="decimal"
                            />
                          </label>

                          <label className="block">
                            <span className="block text-xs font-medium uppercase tracking-wide text-slate-500">{(t as any)("severityLabel")}</span>
                            <select
                              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500 transition"
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
                            <span className="block text-xs font-medium uppercase tracking-wide text-slate-500">{(t as any)("clearOperatorLabel")}</span>
                            <select
                              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500 transition"
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
                            <span className="block text-xs font-medium uppercase tracking-wide text-slate-500">{(t as any)("clearThresholdLabel")}</span>
                            <input
                              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500 transition"
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
                    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500 text-center">
                      {(t as any)("noAlertRulesMsg")}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4">
                <button className="rounded-xl bg-sky-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-60 disabled:cursor-not-allowed" type="submit" disabled={saveLoading}>
                  {saveLoading ? t("saving") : editingId ? (t as any)("updateGroupBtn") : (t as any)("createGroupBtn")}
                </button>
                <button type="button" className="rounded-xl bg-slate-100 px-4 py-2 text-sm hover:bg-slate-200 transition" onClick={closeEditorModal}>
                  {t("cancel")}
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
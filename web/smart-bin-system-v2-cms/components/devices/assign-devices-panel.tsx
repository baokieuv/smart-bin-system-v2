"use client";

import { FormEvent } from "react";
import Panel from "@/components/ui/panel";
import type { TranslationKey } from "@/lib/language";
import type { DeviceDto } from "@/types/device";
import type { UserDto } from "@/types/user";

interface AssignDevicesPanelProps {
  canAssignDevices: boolean;
  selectedDeviceIds: string[];
  devices: DeviceDto[];
  deviceGroups: { id: string; code: string; name: string }[];
  sortedUsers: UserDto[];
  assignSelectedDevices: (event: FormEvent) => void;
  selectAllVisibleDevices: () => void;
  setSelectedDeviceIds: (ids: string[]) => void;
  assignMode: "group" | "user";
  setAssignMode: (mode: "group" | "user") => void;
  assignGroupId: string;
  setAssignGroupId: (id: string) => void;
  assignUserId: string;
  setAssignUserId: (id: string) => void;
  assignMessage: string;
  assignLoading: boolean;
  t: (key: TranslationKey) => string;
}

export default function AssignDevicesPanel({
  canAssignDevices,
  selectedDeviceIds,
  devices,
  deviceGroups,
  sortedUsers,
  assignSelectedDevices,
  selectAllVisibleDevices,
  setSelectedDeviceIds,
  assignMode,
  setAssignMode,
  assignGroupId,
  setAssignGroupId,
  assignUserId,
  setAssignUserId,
  assignMessage,
  assignLoading,
  t,
}: AssignDevicesPanelProps) {
  if (!canAssignDevices) return null;

  return (
    <Panel title={t("assignDevicesTitle")} subtitle={t("assignDevicesSubtitle")}>
      <form className="space-y-4" onSubmit={assignSelectedDevices}>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-foreground">{t("selectedDevicesCount").replace("{count}", String(selectedDeviceIds.length))}</p>
              <p>{selectedDeviceIds.length > 0 ? t("devicesQueued").replace("{count}", String(selectedDeviceIds.length)) : t("selectDevicesToStart")}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={selectAllVisibleDevices}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                disabled={devices.length === 0}
              >
                {t("selectAllBtn")}
              </button>
              <button
                type="button"
                onClick={() => setSelectedDeviceIds([])}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                disabled={selectedDeviceIds.length === 0}
              >
                {t("clearBtn")}
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-3 rounded-1xl border border-slate-200 bg-white p-3 sm:grid-cols-1">
          <button
            type="button"
            onClick={() => setAssignMode("group")}
            className={`rounded-xl px-4 py-3 text-left transition ${
              assignMode === "group" ? "border border-sky-300 bg-sky-50 text-sky-800" : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
            }`}
          >
            <div className="text-sm font-semibold">{t("assignToGroup")}</div>
            <div className="mt-1 text-xs">{t("assignToGroupDesc")}</div>
          </button>
        </div>

        {assignMode === "group" ? (
          <div>
            <label className="block text-sm font-medium text-slate-700">{t("targetGroupLabel")}</label>
            <select className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2" value={assignGroupId} onChange={(event) => setAssignGroupId(event.target.value)}>
              <option value="">{t("selectGroupPlaceholder")}</option>
              {deviceGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.code} - {group.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-slate-700">{t("targetUserLabel")}</label>
            <select className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2" value={assignUserId} onChange={(event) => setAssignUserId(event.target.value)}>
              <option value="">{t("selectUserPlaceholder")}</option>
              {sortedUsers.map((user) => (
                <option key={user.id} value={user.keycloakId}>
                  {user.name} - {user.email} {user.state !== "ACTIVE" ? `(${user.state})` : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            className="rounded-xl bg-sky-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            type="submit"
            disabled={assignLoading || selectedDeviceIds.length === 0 || (assignMode === "group" ? !assignGroupId : !assignUserId)}
          >
            {assignLoading ? t("processing") : t("applyAssignmentBtn")}
          </button>
          {assignMessage ? <p className="text-sm text-slate-600">{assignMessage}</p> : null}
        </div>
      </form>
    </Panel>
  );
}
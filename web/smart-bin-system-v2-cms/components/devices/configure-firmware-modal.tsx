"use client";

import { FormEvent } from "react";
import Modal from "@/components/ui/modal";
import type { TranslationKey } from "@/lib/language";
import type { DeviceDto } from "@/types/device";
import type { FirmwareDto } from "@/types/firmware";
import { firmwareLabel, toLocationKey, toCoordinateText } from "@/app/(admin)/devices/utils";

interface ConfigureFirmwareModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (event: FormEvent) => void;
  device: DeviceDto | null;
  form: { targetBinFirmwareId: string; targetDesktopFirmwareId: string; targetAiModelFirmwareId: string };
  setForm: (updater: (prev: { targetBinFirmwareId: string; targetDesktopFirmwareId: string; targetAiModelFirmwareId: string }) => { targetBinFirmwareId: string; targetDesktopFirmwareId: string; targetAiModelFirmwareId: string }) => void;
  binFirmwares: FirmwareDto[];
  desktopFirmwares: FirmwareDto[];
  aiModelFirmwares: FirmwareDto[];
  isDirty: boolean;
  isLoading: boolean;
  message: string;
  locationTextByKey: Record<string, string>;
  loadingLocationKeys: Record<string, boolean>;
  t: (key: TranslationKey) => string;
}

export default function ConfigureFirmwareModal({
  isOpen,
  onClose,
  onConfirm,
  device,
  form,
  setForm,
  binFirmwares,
  desktopFirmwares,
  aiModelFirmwares,
  isDirty,
  isLoading,
  message,
  locationTextByKey,
  loadingLocationKeys,
  t,
}: ConfigureFirmwareModalProps) {
  if (!isOpen) return null;

  return (
    <Modal title={t("firmwareConfigTitle")} subtitle={t("firmwareConfigSubtitle")} onClose={onClose} widthClassName="w-[min(1100px,98vw)]">
      {device ? (
        <form onSubmit={onConfirm} className="space-y-4">
          {(() => {
            const key = toLocationKey(device.latitude, device.longitude);
            const locationText = key ? locationTextByKey[key] : "";
            const isResolvingLocation = key ? Boolean(loadingLocationKeys[key]) : false;

            return (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                <p>
                  <span className="font-semibold">{t("locationCol")}:</span>{" "}
                  {isResolvingLocation ? t("resolvingAddress") : locationText || toCoordinateText(device.latitude, device.longitude, t)}
                </p>
              </div>
            );
          })()}

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <p className="font-semibold text-foreground">{device.name}</p>
            <p>MAC: {device.mac}</p>
            <p>
              {t("currentBinTarget")} {device.binFirmware?.currentVersion || "-"}
            </p>
            <p>
              {t("currentDesktopTarget")} {device.desktopFirmware?.currentVersion || "-"}
            </p>
            <p>
              {t("currentAiModelTarget")} {device.aiModelFirmware?.currentVersion || "-"}
            </p>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">{t("edgeNodeFirmwareLabel")}</label>
            <select
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
              value={form?.targetBinFirmwareId || ""}
              onChange={(event) => setForm((current) => ({ ...current, targetBinFirmwareId: event.target.value }))}
              disabled={binFirmwares.length === 0}
            >
              <option value="">{binFirmwares.length > 0 ? t("selectTargetFirmware") : t("noFirmwareAvailable")}</option>
              {binFirmwares.map((firmware) => (
                <option key={firmware.id} value={firmware.id}>
                  {firmwareLabel(firmware)}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500">
              {t("currentlySavedTarget")} {device?.binFirmware?.targetVersion || "-"}
            </p>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">{t("masterHubFirmwareLabel")}</label>
            <select
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
              value={form?.targetDesktopFirmwareId || ""}
              onChange={(event) => setForm((current) => ({ ...current, targetDesktopFirmwareId: event.target.value }))}
              disabled={desktopFirmwares.length === 0}
            >
              <option value="">{desktopFirmwares.length > 0 ? t("selectTargetFirmware") : t("noFirmwareAvailable")}</option>
              {desktopFirmwares.map((firmware) => (
                <option key={firmware.id} value={firmware.id}>
                  {firmwareLabel(firmware)}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500">
              {t("currentlySavedTarget")} {device?.desktopFirmware?.targetVersion || "-"}
            </p>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">{t("aiModelFirmwareLabel")}</label>
            <select
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
              value={form?.targetAiModelFirmwareId || ""}
              onChange={(event) => setForm((current) => ({ ...current, targetAiModelFirmwareId: event.target.value }))}
              disabled={aiModelFirmwares.length === 0}
            >
              <option value="">{aiModelFirmwares.length > 0 ? t("selectTargetFirmware") : t("noFirmwareAvailable")}</option>
              {aiModelFirmwares.map((firmware) => (
                <option key={firmware.id} value={firmware.id}>
                  {firmwareLabel(firmware)}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500">
              {t("currentlySavedTarget")} {device?.aiModelFirmware?.targetVersion || "-"}
            </p>
          </div>

          <div className="flex items-center gap-2 border-t border-slate-200 pt-4">
            <button className="rounded-xl bg-sky-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" type="submit" disabled={!isDirty || isLoading}>
              {isLoading ? t("saving") : t("applyConfigBtn")}
            </button>
            <button type="button" className="rounded-xl bg-slate-100 px-4 py-2 text-sm" onClick={onClose}>
              {t("cancel")}
            </button>
            {message ? <p className="text-sm text-slate-600">{message}</p> : null}
          </div>
        </form>
      ) : (
        <p className="text-sm text-slate-600">{t("clickConfigurePrompt")}</p>
      )}
    </Modal>
  );
}
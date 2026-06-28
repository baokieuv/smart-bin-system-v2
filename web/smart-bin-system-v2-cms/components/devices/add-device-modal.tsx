"use client";

import { FormEvent } from "react";
import Modal from "@/components/ui/modal";
import { LocationPickerMap, type LocationValue } from "@/components/layout/location-picker-map";
import type { TranslationKey } from "@/lib/language";
import { formatMacAddress, MAC_PATTERN, CLAIM_CODE_PATTERN } from "@/app/(admin)/devices/utils";

interface AddDeviceForm {
  mac: string;
  name: string;
  claimCode: string;
  latitude: string;
  longitude: string;
  pollingInterval: string;
  fullThreshold: string;
}

interface AddDeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (event: FormEvent) => void;
  form: AddDeviceForm;
  setForm: (updater: (prev: AddDeviceForm) => AddDeviceForm) => void;
  message: string;
  createLoading: boolean;
  canSubmitAddDevice: boolean;
  addLocation: LocationValue | null;
  t: (key: TranslationKey) => string;
}

export default function AddDeviceModal({
  isOpen,
  onClose,
  onCreate,
  form,
  setForm,
  message,
  createLoading,
  canSubmitAddDevice,
  addLocation,
  t,
}: AddDeviceModalProps) {
  if (!isOpen) return null;

  const isMacValid = MAC_PATTERN.test(form.mac.trim());
  const isClaimCodeValid = CLAIM_CODE_PATTERN.test(form.claimCode.trim());

  return (
    <Modal title={t("addDeviceModalTitle")} subtitle={t("addDeviceModalSubtitle")} onClose={onClose} widthClassName="w-[min(1100px,98vw)]">
      <form onSubmit={onCreate} className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">{t("deviceName")}</label>
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2"
                placeholder="Smart Bin 01"
                value={form.name}
                onChange={(event) => setForm((v) => ({ ...v, name: event.target.value }))}
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">{t("macAddress")}</label>
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2"
                placeholder="AA:BB:CC:DD:EE:FF"
                value={form.mac}
                onChange={(event) => setForm((v) => ({ ...v, mac: formatMacAddress(event.target.value) }))}
                required
              />
              {!isMacValid && form.mac.trim() ? <p className="mt-1 text-xs text-rose-600">{t("invalidMacFormat")}</p> : null}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">{t("activationClaimCodeLabel")}</label>
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2"
                placeholder={t("sixCharsPlaceholder")}
                value={form.claimCode}
                onChange={(event) => setForm((v) => ({ ...v, claimCode: event.target.value.slice(0, 6) }))}
                required
              />
              {!isClaimCodeValid && form.claimCode.trim() ? <p className="mt-1 text-xs text-rose-600">{t("invalidClaimCode")}</p> : null}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">{t("latitude")}</label>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  placeholder="21.028500"
                  value={form.latitude}
                  onChange={(event) => setForm((v) => ({ ...v, latitude: event.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">{t("longitude")}</label>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  placeholder="105.854200"
                  value={form.longitude}
                  onChange={(event) => setForm((v) => ({ ...v, longitude: event.target.value }))}
                  required
                />
              </div>
            </div>

            {!addLocation && (form.latitude || form.longitude) ? <p className="text-xs text-rose-600">{t("invalidCoordinates")}</p> : null}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">{t("pollingIntervalLabel")}</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  placeholder={t("secondsOptional")}
                  value={form.pollingInterval}
                  onChange={(event) => setForm((v) => ({ ...v, pollingInterval: event.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">{t("fullThresholdLabel")}</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  placeholder={t("percentOptional")}
                  value={form.fullThreshold}
                  onChange={(event) => setForm((v) => ({ ...v, fullThreshold: event.target.value }))}
                />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="mb-2 text-sm font-medium text-slate-700">{t("pickLocationMap")}</p>
            <LocationPickerMap
              className="h-105 w-full rounded-xl border border-slate-200"
              value={addLocation}
              onChange={(location) => setForm((v) => ({ ...v, latitude: location.latitude.toFixed(6), longitude: location.longitude.toFixed(6) }))}
            />
            <p className="mt-2 text-xs text-slate-500">{t("clickMapInstruction")}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-slate-200 pt-4">
          <button className="rounded-xl bg-sky-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" type="submit" disabled={!canSubmitAddDevice}>
            {createLoading ? t("addingBtn") : t("addDeviceBtn")}
          </button>
          <button type="button" className="rounded-xl bg-slate-100 px-4 py-2 text-sm" onClick={onClose}>
            {t("cancel")}
          </button>
          {message ? <p className="text-sm text-slate-600">{message}</p> : null}
        </div>
      </form>
    </Modal>
  );
}
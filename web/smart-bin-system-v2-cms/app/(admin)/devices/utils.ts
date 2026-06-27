import type { LocationValue } from "@/components/layout/location-picker-map";
import type { TranslationKey } from "@/lib/language";
import type { FirmwareDto } from "@/types/firmware";

export type RpcMethodOption = {
  method: string;
  label: string;
  type: "ONE_WAY" | "TWO_WAY";
  description: string;
};

export const getRpcMethodOptions = (t: (key: TranslationKey) => string): RpcMethodOption[] => [
  { method: "openLid", label: t("rpcOpenLid"), type: "TWO_WAY", description: t("rpcOpenLidDesc") },
  { method: "closeLid", label: t("rpcCloseLid"), type: "TWO_WAY", description: t("rpcCloseLidDesc") },
  { method: "lockBin", label: t("rpcLockBin"), type: "TWO_WAY", description: t("rpcLockBinDesc") },
  { method: "unlockBin", label: t("rpcUnlockBin"), type: "TWO_WAY", description: t("rpcUnlockBinDesc") },
  { method: "forceSync", label: t("rpcForceSync"), type: "ONE_WAY", description: t("rpcForceSyncDesc") },
  { method: "triggerAlarmAlert", label: t("rpcTriggerAlert"), type: "ONE_WAY", description: t("rpcTriggerAlertDesc") },
  { method: "rebootDevice", label: t("rpcRebootDevice"), type: "ONE_WAY", description: t("rpcRebootDeviceDesc") },
  { method: "calibrateSensor", label: t("rpcCalibrateSensors"), type: "TWO_WAY", description: t("rpcCalibrateSensorsDesc") },
  { method: "setPollingInterval", label: t("rpcSetPollingInterval"), type: "TWO_WAY", description: t("rpcSetPollingIntervalDesc") },
  { method: "clearHardwareError", label: t("rpcClearHardwareErrors"), type: "TWO_WAY", description: t("rpcClearHardwareErrorsDesc") },
  { method: "triggerOtaUpdate", label: t("rpcTriggerOtaUpdate"), type: "ONE_WAY", description: t("rpcTriggerOtaUpdateDesc") },
];

export const getRpcMethodOption = (method: string, t: (key: TranslationKey) => string) => {
  const options = getRpcMethodOptions(t);
  return options.find((option) => option.method === method) ?? options[0];
};

export const getDefaultRpcParams = (method: string) => {
  switch (method) {
    case "setPollingInterval":
      return JSON.stringify({ intervalSeconds: 60 }, null, 2);
    case "triggerAlarmAlert":
      return JSON.stringify({ message: "Manual alert" }, null, 2);
    case "calibrateSensor":
      return JSON.stringify({}, null, 2);
    default:
      return JSON.stringify({}, null, 2);
  }
};

export const firmwareLabel = (firmware: FirmwareDto) => {
  const suffix = firmware.description ? ` - ${firmware.description}` : "";
  return `${firmware.version}${suffix}`;
};

export const firmwareTimestamp = (firmware: FirmwareDto) => {
  if (!firmware.createdDate) return 0;
  const parsed = Date.parse(firmware.createdDate);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const getLatestFirmware = (firmwares: FirmwareDto[], type: "ESP32" | "RASPBERRY_PI" | "AI_MODEL") =>
  [...firmwares]
    .filter((firmware) => firmware.type === type)
    .sort((left, right) => firmwareTimestamp(right) - firmwareTimestamp(left) || right.version.localeCompare(left.version, undefined, { numeric: true, sensitivity: "base" }))[0];

export const MAC_PATTERN = /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/;
export const CLAIM_CODE_PATTERN = /^.{6}$/;

export const formatMacAddress = (rawValue: string) => {
  const normalized = rawValue.toUpperCase().replace(/[^0-9A-F]/g, "").slice(0, 12);
  const pairs = normalized.match(/.{1,2}/g);
  return pairs ? pairs.join(":") : "";
};

export const parseCoordinatePair = (latitudeValue: string, longitudeValue: string): LocationValue | null => {
  const latitude = Number(latitudeValue);
  const longitude = Number(longitudeValue);
  if (Number.isNaN(latitude) || Number.isNaN(longitude)) return null;
  if (latitude < -90 || latitude > 90) return null;
  if (longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
};

export const parseOptionalNumber = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isNaN(parsed) ? undefined : parsed;
};

export const toLocationKey = (latitude?: number, longitude?: number) => {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return "";
  return `${Number(latitude).toFixed(6)},${Number(longitude).toFixed(6)}`;
};

export const toCoordinateText = (latitude?: number, longitude?: number, t?: (key: TranslationKey) => string) => {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return t ? t("locationUnavailable") : "Location unavailable";
  return `${Number(latitude).toFixed(6)}, ${Number(longitude).toFixed(6)}`;
};
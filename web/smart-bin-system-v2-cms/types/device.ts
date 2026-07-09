export type DeviceStatus = "ONLINE" | "OFFLINE" | string;
export type DeviceState = string;

export interface DeviceDto {
  id: string;
  name: string;
  accessToken?: string;
  mac: string;
  groupCode?: string;
  longitude?: number;
  latitude?: number;
  state?: DeviceState;
  status: DeviceStatus;
  createdDate: string;
  claimedAt?: number;
  desktopFirmware?: FirmwareResponse;
  binFirmware?: FirmwareResponse;
  aiModelFirmware?: FirmwareResponse;
  userConfigs?: Record<string, unknown>;
}

export interface DeviceAdminConfigDto {
  targetBinFirmwareId?: string | null;
  targetDesktopFirmwareId?: string | null;
  targetBinVersion?: string | null;
  targetDesktopVersion?: string | null;
  targetAiModelVersion?: string | null;
  targetAiModelFirmwareId?: string | null;
}

export interface DeviceOperationResult {
  mac: string;
  status: boolean;
  message: string;
}

export interface TelemetryParams {
  keys?: string;
  startTs?: number;
  endTs?: number;
  limit?: number;
  agg?: string;
  interval?: number;
  [key: string]: unknown;
}

export type RpcRequestPayload = {
  method: string;
  params?: unknown;
};

export type FirmwareResponse = {
  currentVersion: string;
  targetVersion: string;
}

export type DeviceImportRequestItem = {
  mac: string;
  claimCode: string;
  name?: string;
  latitude?: number;
  longitude?: number;
};

export type ImportDeviceResponseItem = {
  mac: string;
  status: string;
  message: string;
};

export type AddDeviceRequest = {
  mac: string;
  longitude: number;
  latitude: number;
  name: string;
  claimCode: string;
};

export type UpdateDeviceRequest = {
  name?: string;
  latitude?: number;
  longitude?: number;
  pollingInterval?: number;
  fullThreshold?: number;
  scope?: string;
  additionalAttributes?: Record<string, unknown>;
};

export type FilterDeviceParams = {
  tenantId?: string;
  name?: string;
  mac?: string;
  state?: string; 
  groupId?: string;
  page?: number;
  size?: number;
}

export type TelemetryPayload = Record<string, Array<{ ts: number; value: string }>>;
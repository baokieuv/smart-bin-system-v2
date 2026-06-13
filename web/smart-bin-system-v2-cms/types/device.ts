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
  desktopVersion?: string;
  binVersion?: string;
  targetBinVersion?: string;
  targetDesktopVersion?: string;
  userConfigs?: Record<string, unknown>;
}

export interface DeviceAdminConfigDto {
  targetBinFirmwareId?: string | null;
  targetDesktopFirmwareId?: string | null;
  targetBinVersion?: string | null;
  targetDesktopVersion?: string | null;
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

export type DeviceImportRequestItem = {
  mac: string;
  claimCode: string;
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
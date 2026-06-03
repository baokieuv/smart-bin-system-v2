// Device domain types and request DTOs.

export type DeviceStatus = 'ONLINE' | 'OFFLINE';

export type DeviceDto = {
  id: string;
  name: string;
  accessToken?: string;
  mac: string;
  longitude: number;
  latitude: number;
  state: string;
  status: DeviceStatus | string;
  createdDate: string;
  claimedAt?: number;
  desktopVersion?: string;
  binVersion?: string;
  groupCode?: string;
  userConfigs?: Record<string, unknown>;
};

export type DeviceAttributes = Record<string, unknown>;

export type AddDeviceRequest = {
  mac: string;
  longitude: number;
  latitude: number;
  name: string;
  claimCode: string;
};

export type TelemetryPoint = {
  ts: number;
  value: string;
};

export type DeviceTelemetries = Record<string, TelemetryPoint[]>;

export interface TelemetryParams {
  keys?: string;
  startTs?: number;
  endTs?: number;
  limit?: number;
  agg?: string;
  interval?: number;
  [key: string]: any;
}

export type UpdateDeviceRequest = {
  name?: string;
  latitude?: number;
  longitude?: number;
  pollingInterval?: number;
  fullThreshold?: number;
  scope?: string;
  additionalAttributes?: Record<string, unknown>;
};
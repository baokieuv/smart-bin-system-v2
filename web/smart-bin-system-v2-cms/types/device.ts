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

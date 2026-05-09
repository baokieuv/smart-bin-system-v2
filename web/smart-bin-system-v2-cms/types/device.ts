export type DeviceStatus = "ONLINE" | "OFFLINE" | string;
export type DeviceState = string;

export interface DeviceDto {
  id: string;
  name: string;
  accessToken?: string;
  mac: string;
  longitude?: number;
  latitude?: number;
  state?: DeviceState;
  status: DeviceStatus;
  createdDate: string;
  claimedAt?: number;
  desktopVersion?: string;
  binVersion?: string;
}

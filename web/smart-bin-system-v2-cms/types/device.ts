export type DeviceStatus = "ONLINE" | "OFFLINE" | string;

export interface DeviceDto {
  id: string;
  name: string;
  mac: string;
  longitude: number;
  latitude: number;
  state: string;
  status: DeviceStatus;
  createdDate: string;
}

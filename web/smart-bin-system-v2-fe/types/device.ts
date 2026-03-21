export type DeviceStatus = 'online' | 'offline';

export type Device = {
  id: string;
  name: string;
  macAddress: string;
  status: DeviceStatus;
  longitude: number;
  latitude: number;
  addedAt: string;
  trashLevel: number;
};

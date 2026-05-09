import type { PagedPayload } from "@/types/core";

export interface DeviceGroupDto {
  id: string;
  code: string;
  name: string;
  binHeight: number;
  description?: string;
}

export type DeviceGroupListPayload = PagedPayload<DeviceGroupDto>;

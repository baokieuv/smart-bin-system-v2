import type { PagedPayload } from "@/types/core";

export interface DeviceGroupDto {
  id: string;
  code: string;
  name: string;
  metadata: Record<string, unknown>;
  description?: string;
}

export type DeviceGroupListPayload = PagedPayload<DeviceGroupDto>;

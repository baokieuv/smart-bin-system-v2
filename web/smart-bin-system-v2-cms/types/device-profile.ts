import type { PagedPayload } from "@/types/core";

export interface DeviceProfileDto {
  id: string;
  code: string;
  name: string;
  sharedSpecs: Record<string, unknown>;
  description?: string;
}

export type DeviceProfileListPayload = PagedPayload<DeviceProfileDto>;
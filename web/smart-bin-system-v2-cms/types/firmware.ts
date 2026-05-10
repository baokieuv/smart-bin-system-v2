import type { PagedPayload } from "@/types/core";

export type FirmwareType = "ESP32" | "RASPBERRY_PI" | string;

export interface FirmwareDto {
  id: string;
  version: string;
  type: FirmwareType;
  description?: string;
  fileName?: string;
  objectPath?: string;
  createdDate?: string;
}

export type FirmwareListPayload = PagedPayload<FirmwareDto>;

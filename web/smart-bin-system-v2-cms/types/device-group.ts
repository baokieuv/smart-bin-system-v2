import type { PagedPayload } from "@/types/core";

export interface AlarmRuleDto {
  alarmType: string;
  operator: string;
  threshold: number;
  severity: string;
  clearOperator: string;
  clearThreshold: number;
}

export interface CreateDeviceGroupRequest {
  code: string;
  name: string;
  sharedSpecs: Record<string, unknown>;
  description?: string;
  alarmRules: AlarmRuleDto[];
}

export interface UpdateDeviceGroupRequest {
  code?: string;
  name?: string;
  metadata?: Record<string, unknown>;
  description?: string;
  alarmRules: AlarmRuleDto[];
}

export interface DeviceGroupDto {
  id: string;
  code: string;
  name: string;
  isDefault: boolean;
  metadata: Record<string, unknown>;
  description?: string;
  alarmRules?: AlarmRuleDto[];
}

export type DeviceGroupListPayload = PagedPayload<DeviceGroupDto>;

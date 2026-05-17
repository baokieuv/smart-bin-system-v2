export interface FirmwareMappingDto {
  id: string;
  metadataCriteria: Record<string, unknown>;
  targetFirmwareId: string;
  targetFirmwareVersion?: string;
  priority?: number;
  active: boolean;
}

export interface CreateFirmwareMappingRequest {
  metadataCriteria: Record<string, unknown>;
  targetFirmwareId: string;
  priority?: number;
}

export interface UpdateFirmwareMappingRequest {
  metadataCriteria: Record<string, unknown>;
  targetFirmwareId: string;
  priority?: number;
  active?: boolean;
}

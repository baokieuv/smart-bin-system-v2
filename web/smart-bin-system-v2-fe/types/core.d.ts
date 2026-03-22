// Shared generic API response types.

export interface BaseResponse <T = any> {
  traceId: string,
  timestamp: number,
  success: boolean,
  code: string,
  message: string,
  data: T
}
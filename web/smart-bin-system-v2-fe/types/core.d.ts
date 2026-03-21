export interface BaseResponse {
  traceId: string,
  timestamp: number,
  success: boolean,
  code: string,
  message: string,
  data: any
}
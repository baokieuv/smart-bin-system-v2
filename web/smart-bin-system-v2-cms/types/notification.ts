export type NotificationType =
  | "THRESHOLD_WARNING"
  | "THRESHOLD_CRITICAL"
  | "ANOMALY_DETECTED"
  | "DEVICE_OFFLINE"
  | "DEVICE_ONLINE"
  | "LOW_BATTERY"
  | "SENSOR_FAULT"
  | "COMMAND_SUCCESS"
  | "COMMAND_FAILED"
  | "MAINTENANCE_REQUIRED"
  | "SYSTEM_INFO";

export interface NotificationDto {
  id: string | number;
  title: string;
  message: string;
  type: NotificationType;
  isRead: boolean;
  createdDate: string;
}

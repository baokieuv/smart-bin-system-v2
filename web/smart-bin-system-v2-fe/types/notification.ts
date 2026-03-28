// Notification domain types mirrored from backend contracts.

export type NotificationType =
  | 'THRESHOLD_WARNING'
  | 'THRESHOLD_CRITICAL'
  | 'ANOMALY_DETECTED'
  | 'DEVICE_OFFLINE'
  | 'DEVICE_ONLINE'
  | 'LOW_BATTERY'
  | 'SENSOR_FAULT'
  | 'COMMAND_SUCCESS'
  | 'COMMAND_FAILED'
  | 'FIRMWARE_UPDATE_SUCCESS'
  | 'FIRMWARE_UPDATE_FAILED'
  | 'MAINTENANCE_REQUIRED'
  | 'SYSTEM_INFO'
  | 'DEVICE_CREATED'
  | 'DEVICE_DELETED';

export type NotificationDto = {
  id: string | number;
  title: string;
  message: string;
  type: NotificationType;
  isRead: boolean;
  createdDate: string;
};

export type NotificationListPayload =
  | NotificationDto[]
  | {
      items?: NotificationDto[];
      content?: NotificationDto[];
      data?: NotificationDto[];
      page?: number;
      pageNumber?: number;
      size?: number;
      pageSize?: number;
      totalPages?: number;
      totalElements?: number;
      hasNext?: boolean;
    };

export type UnreadCountPayload = number | { unreadCount?: number; count?: number; total?: number };

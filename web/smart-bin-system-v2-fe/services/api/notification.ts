// Service layer for notification and activity endpoints.

import { api } from '@/lib/api-client';
import { NotificationListPayload, UnreadCountPayload } from '@/types/notification';

export interface NotificationListParams {
  page: number;
  size: number;
  [key: string]: unknown;
}

export interface MarkNotificationsRequest {
  ids: number[];
  isRead: boolean;
}

export const notificationApi = {
  // Get notification feed for activity timeline
  getList: async (params: NotificationListParams) => {
    return api.get<NotificationListPayload>('/notifications/', params);
  },

  // Get unread notification count
  getUnreadCount: async () => {
    return api.get<UnreadCountPayload>('/notifications/get-unread-count');
  },

  // Mark one notification as read
  markAsRead: async (id: string | number) => {
    return api.put(`/notifications/${id}/read`);
  },

  // Mark all notifications as read
  readAll: async () => {
    return api.put('/notifications/read-all');
  },

  // Batch update read/unread status
  markMany: async (request: MarkNotificationsRequest) => {
    return api.put('/notifications/reads', request);
  },
};

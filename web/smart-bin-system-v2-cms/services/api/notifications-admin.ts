import { api } from "@/lib/api-client";
import type { MarkNotificationsRequest, NotificationDto, UnreadCountPayload } from "@/types/notification";

export const notificationsAdminApi = {
  getNotifications: async (params?: { page?: number; size?: number }) =>
    api.get<NotificationDto[] | { items?: NotificationDto[]; content?: NotificationDto[] }>("/notifications", params, { cacheTTL: 300000 }),
  markAsRead: async (id: string | number) => api.put(`/notifications/${id}/read`),
  readAll: async () => api.put("/notifications/read-all"),
  
  // Get unread notification count
  getUnreadCount: async () => {
    return api.get<UnreadCountPayload>('/notifications/get-unread-count', undefined, { cacheTTL: 60000 });
  },

  // Batch update read/unread status
  markMany: async (request: MarkNotificationsRequest) => {
    return api.put('/notifications/reads', request);
  },
};

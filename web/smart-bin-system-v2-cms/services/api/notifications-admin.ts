import { api } from "@/lib/api-client";
import type { NotificationDto } from "@/types/notification";

export const notificationsAdminApi = {
  getNotifications: async (params?: { page?: number; size?: number }) =>
    api.get<NotificationDto[] | { items?: NotificationDto[]; content?: NotificationDto[] }>("/notifications", params, { cacheTTL: 30000 }),
  markAsRead: async (id: string | number) => api.put(`/notifications/${id}/read`),
  readAll: async () => api.put("/notifications/read-all"),
};

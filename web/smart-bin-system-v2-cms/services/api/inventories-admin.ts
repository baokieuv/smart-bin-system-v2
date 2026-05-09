import { api } from "@/lib/api-client";

export const inventoriesAdminApi = {
  importInventory: async (payload: { items: { sku: string; quantity: number }[] }) => api.post("/inventories/import-inventory", payload),
  reserveInventory: async (payload: { sku: string; quantity: number }) => api.post("/inventories/reserve", payload),
};

"use client";

import type { TranslationKey } from "@/lib/language";

export interface FilterProps {
  name: string;
  mac: string;
  groupId: string;
  status: string;
  tenantId: string;
}

interface DevicesFilterPanelProps {
  filters: FilterProps;
  onFiltersChange: (newFilters: FilterProps) => void;
  onApply: () => void;
  onClear: () => void;
  deviceGroups: { id: string; code: string; name: string }[];
  tenants?: { id: string; name: string }[]; // Optional for admin
  t: (key: TranslationKey) => string;
}

export default function DevicesFilterPanel({
  filters,
  onFiltersChange,
  onApply,
  onClear,
  deviceGroups,
  tenants,
  t,
}: DevicesFilterPanelProps) {
  const handleInputChange = (field: keyof FilterProps, value: string) => {
    onFiltersChange({ ...filters, [field]: value });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {/* Name Filter */}
        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">{t("deviceName")}</label>
          <input
            type="text"
            value={filters.name}
            onChange={(e) => handleInputChange("name", e.target.value)}
            placeholder={t("filterByNamePlaceholder")}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>

        {/* MAC Filter */}
        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">{t("macAddress")}</label>
          <input
            type="text"
            value={filters.mac}
            onChange={(e) => handleInputChange("mac", e.target.value)}
            placeholder={t("filterByMacPlaceholder")}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>

        {/* Group Filter */}
        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">{t("groupCol")}</label>
          <select value={filters.groupId} onChange={(e) => handleInputChange("groupId", e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white">
            <option value="">{t("allGroups")}</option>
            {deviceGroups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </div>

        {/* Status Filter */}
        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">{t("statusCol")}</label>
          <select value={filters.status} onChange={(e) => handleInputChange("status", e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white">
            <option value="">{t("allStatuses")}</option>
            <option value="online">{t("onlineStatus")}</option>
            <option value="offline">{t("offlineStatus")}</option>
          </select>
        </div>

        {/* Tenant Filter (for admin) */}
        {tenants && (
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">{t("tenantCol")}</label>
            <select value={filters.tenantId} onChange={(e) => handleInputChange("tenantId", e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white">
              <option value="">{t("allTenants")}</option>
              {tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onApply} className="rounded-lg bg-sky-800 px-4 py-2 text-sm font-semibold text-white">
          {t("applyFilters")}
        </button>
        <button type="button" onClick={onClear} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
          {t("clearFilters")}
        </button>
      </div>
    </div>
  );
}
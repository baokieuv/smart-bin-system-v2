"use client";

import { FormEvent, useEffect, useState } from "react";
import Panel from "@/components/ui/panel";
import Modal from "@/components/ui/modal";
import { unwrapListPayload } from "@/lib/admin-utils";
import { tenantsAdminApi } from "@/services/api/tenants-admin";
import { useLanguage } from "@/lib/language"; // IMPORT HOOK NGÔN NGỮ
import type { TenantDto } from "@/types/tenant";

const tenantStates = ["ACTIVE", "PENDING", "BLOCKED", "DELETED"] as const;

export default function TenantsPage() {
  const { t } = useLanguage(); // GỌI HOOK
  
  const [tenants, setTenants] = useState<TenantDto[]>([]);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ name: "", email: "" });
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [updatingTenantId, setUpdatingTenantId] = useState<string | null>(null);

  const load = async () => {
    const response = await tenantsAdminApi.getTenants({ page: 1, size: 100 });
    setTenants(unwrapListPayload(response.data));
  };

  useEffect(() => {
    void load().catch((error) => {
      setMessage(error instanceof Error ? error.message : t("tenantsLoadError"));
    });

    const email = typeof window !== "undefined" ? localStorage.getItem("admin_email") : null;
    setCurrentEmail(email);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createTenant = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    setCreateLoading(true);

    try {
      await tenantsAdminApi.createTenant({ name: form.name, email: form.email });
      setForm({ name: "", email: "" });
      setMessage(t("tenantCreatedSuccess"));
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("tenantCreateError"));
    } finally {
      setCreateLoading(false);
    }
  };

  const openCreateModal = () => {
    setForm({ name: "", email: "" });
    setMessage("");
    setShowCreateModal(true);
  };

  const closeCreateModal = () => {
    setShowCreateModal(false);
    setForm({ name: "", email: "" });
  };

  const updateTenantState = async (id: string, status: string) => {
    try {
      setUpdatingTenantId(id);
      await tenantsAdminApi.updateTenantStatus(id, { status });
      // Thay thế {status} trong chuỗi dịch bằng biến status thực tế
      const successMsg = t("tenantStatusUpdateSuccess").replace("{status}", status);
      setMessage(successMsg);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("tenantStatusUpdateError"));
    } finally {
      setUpdatingTenantId(null);
    }
  };

  return (
    <div className="space-y-4">
      <Panel
        title={t("innoecoPartners")}
        subtitle={t("partnersSubtitle")}
        action={
          <button type="button" onClick={openCreateModal} className="rounded-xl bg-[linear-gradient(120deg,#0b3b62,#176ea5)] px-3 py-2 text-xs font-semibold text-white shadow-[0_12px_24px_rgba(22,99,156,0.35)] transition hover:brightness-110">
            {t("addPartnerAccount")}
          </button>
        }
      >
        <p className="text-sm text-slate-600">{t("partnersDescription")}</p>
      </Panel>

      <Panel title={t("partnerDirectory")} subtitle={t("partnerDirectorySubtitle")}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-240 text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                <th className="py-2">{t("organizationName")}</th>
                <th className="py-2">{t("email")}</th>
                <th className="py-2">{t("accountState")}</th>
                <th className="py-2">{t("action")}</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((tenant) => (
                <tr key={tenant.id} className="border-b border-slate-200/70">
                  <td className="py-2 font-medium text-foreground">{tenant.name}</td>
                  <td className="py-2 text-slate-600">{tenant.email}</td>
                  <td className="py-2 text-slate-600">{tenant.state}</td>
                  <td className="py-2">
                    {currentEmail && tenant.email === currentEmail ? (
                      <span className="text-slate-500">-</span>
                    ) : (
                      <select
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1"
                        value={tenant.state}
                        disabled={updatingTenantId === tenant.id}
                        onChange={(event) => void updateTenantState(tenant.id, event.target.value)}
                      >
                        {tenantStates.map((state) => (
                          <option key={state} value={state}>
                            {state}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {showCreateModal ? (
        <Modal title={t("createPartnerAccount")} subtitle={t("createPartnerSubtitle")} onClose={closeCreateModal}>
          <form className="space-y-4" onSubmit={createTenant}>
            <div>
              <label className="block text-sm font-medium text-slate-700">{t("organizationName")}</label>
              <input
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none transition focus:border-sky-500"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder={t("egOrganization")}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">{t("contactEmail")}</label>
              <input
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none transition focus:border-sky-500"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                placeholder={t("partnerEmailPlaceholder")}
              />
            </div>
            <div className="flex items-center gap-2 border-t border-slate-200 pt-4">
              <button
                type="submit"
                disabled={createLoading}
                className="rounded-xl bg-[linear-gradient(120deg,#0b3b62,#176ea5)] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(22,99,156,0.35)] transition hover:brightness-110"
              >
                {createLoading ? t("creating") : t("createAccount")}
              </button>
              <button type="button" className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm" onClick={closeCreateModal}>
                {t("cancel")}
              </button>
              {message ? <p className="text-sm text-slate-600">{message}</p> : null}
            </div>
          </form>
        </Modal>
      ) : null}

      {!showCreateModal && message ? <p className="text-sm text-slate-600">{message}</p> : null}
    </div>
  );
}
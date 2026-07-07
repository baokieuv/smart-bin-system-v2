"use client";

import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";
import Panel from "@/components/ui/panel";
import { unwrapListPayload } from "@/lib/admin-utils";
import { getCmsAccessRole } from "@/lib/auth-session";
import { getRecaptchaToken } from "@/lib/recaptcha";
import { emitToast } from "@/lib/toast";
import { usersAdminApi } from "@/services/api/users-admin";
import { useLanguage, type TranslationKey } from "@/lib/language"; // IMPORT HOOK NGÔN NGỮ
import type { CreateUserRequest } from "@/types/auth";
import type { UserDto } from "@/types/user";

const states: UserDto["state"][] = ["ACTIVE", "PENDING", "SUSPENDED", "DELETED"];

// Sử dụng hàm để gọi t()
const getDevicePermissions = (t: (key: TranslationKey) => string) => [
  { key: "VIEW_DEVICE", label: t("permViewDevices"), description: t("permViewDevicesDesc") },
  { key: "EDIT_DEVICE", label: t("permEditDevices"), description: t("permEditDevicesDesc") },
  { key: "DELETE_DEVICE", label: t("permDeleteDevices"), description: t("permDeleteDevicesDesc") },
  { key: "CONTROL_DEVICE", label: t("permControlDevices"), description: t("permControlDevicesDesc") },
];

const formatStateLabel = (state: UserDto["state"], t: (key: TranslationKey) => string) => {
  switch (state) {
    case "ACTIVE":
      return t("stateActive");
    case "PENDING":
      return t("statePending");
    case "SUSPENDED":
      return t("stateSuspended");
    case "DELETED":
      return t("stateDeleted");
    default:
      return state;
  }
};

const formatPermissionsLabel = (perms: string[] | undefined, t: (key: TranslationKey) => string) => {
  if (!perms || perms.length === 0) return t("permViewDefault");
  return perms
    .map((p) => p.split('_')[0])
    .map((p) => p.charAt(0) + p.slice(1).toLowerCase())
    .join(", ");
};

const emptyCreateUserForm = {
  email: "",
  password: "",
  name: "",
};

export default function UsersPage() {
  const { t } = useLanguage(); // GỌI HOOK
  
  const [users, setUsers] = useState<UserDto[]>([]);
  const [message, setMessage] = useState("");
  const [role, setRole] = useState<"super_admin" | "admin" | "user" | null>(null);
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);
  
  // Create User State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreateUserForm);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  // Permissions Modal State
  const [isPermsOpen, setIsPermsOpen] = useState(false);
  const [selectedUserForPerms, setSelectedUserForPerms] = useState<UserDto | null>(null);
  const [permissionsForm, setPermissionsForm] = useState<string[]>([]);
  const [isUpdatingPerms, setIsUpdatingPerms] = useState(false);

  const devicePermissionsList = getDevicePermissions(t);

  const load = async () => {
    const response = await usersAdminApi.getUsers({ page: 1, size: 100 });
    setUsers(unwrapListPayload(response.data));
  };

  const loadRole = () => {
    const cachedRole = typeof window !== "undefined" ? localStorage.getItem("admin_role") : null;
    if (cachedRole === "super_admin" || cachedRole === "admin" || cachedRole === "user") {
      setRole(cachedRole);
      return;
    }

    const cachedRoles = typeof window !== "undefined" ? localStorage.getItem("admin_roles") : null;
    if (!cachedRoles) {
      setRole(null);
      return;
    }

    try {
      const parsedRoles = JSON.parse(cachedRoles) as unknown;
      if (Array.isArray(parsedRoles)) {
        const accessRole = getCmsAccessRole(parsedRoles.filter((candidate): candidate is string => typeof candidate === "string"));
        setRole(accessRole);
      } else {
        setRole(null);
      }
    } catch {
      setRole(null);
    }
  };

  useEffect(() => {
    loadRole();
    void load().catch((error) => {
      setMessage(error instanceof Error ? error.message : t("loadUserListError"));
    });
    const email = typeof window !== "undefined" ? localStorage.getItem("admin_email") : null;
    setCurrentEmail(email);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateState = async (id: string, state: UserDto["state"]) => {
    try {
      setUpdatingUserId(id);
      await usersAdminApi.updateUserState(id, state);
      emitToast(t("userStatusUpdateSuccess").replace("{state}", formatStateLabel(state, t)), "success");
      await load();
    } catch (error) {
      emitToast(error instanceof Error ? error.message : t("userStatusUpdateError"), "error");
    } finally {
      setUpdatingUserId(null);
    }
  };

  const openCreateUser = () => {
    setMessage("");
    setCreateForm(emptyCreateUserForm);
    setIsCreateOpen(true);
  };

  const closeCreateUser = () => {
    if (isSubmitting) return;
    setIsCreateOpen(false);
    setCreateForm(emptyCreateUserForm);
  };

  const createUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);

    try {
      const captcha = await getRecaptchaToken("REGISTER");
      const request: CreateUserRequest = {
        email: createForm.email.trim(),
        password: createForm.password,
        name: createForm.name.trim(),
        captcha,
      };

      await usersAdminApi.createUser(request);
      emitToast(t("userCreatedSuccess"), "success");
      setIsCreateOpen(false);
      setCreateForm(emptyCreateUserForm);
      await load();
    } catch (error) {
      emitToast(error instanceof Error ? error.message : t("userCreateError"), "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openPermissionsModal = (user: UserDto) => {
    setSelectedUserForPerms(user);
    // Add VIEW_DEVICE as a baseline if missing
    const currentPerms = user.devicePermissions || ["VIEW_DEVICE"];
    setPermissionsForm(currentPerms.includes("VIEW_DEVICE") ? currentPerms : [...currentPerms, "VIEW_DEVICE"]);
    setMessage("");
    setIsPermsOpen(true);
  };

  const closePermissionsModal = () => {
    if (isUpdatingPerms) return;
    setIsPermsOpen(false);
    setSelectedUserForPerms(null);
  };

  const togglePermission = (key: string) => {
    if (key === "VIEW_DEVICE") return; // VIEW_DEVICE cannot be toggled
    setPermissionsForm((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]
    );
  };

  const savePermissions = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedUserForPerms) return;
    
    setIsUpdatingPerms(true);
    setMessage("");
    
    try {
      await usersAdminApi.updateUserPermissions(selectedUserForPerms.id, permissionsForm);
      emitToast(t("permsUpdateSuccess").replace("{name}", selectedUserForPerms.name), "success");
      setIsPermsOpen(false);
      await load();
    } catch (error) {
      emitToast(error instanceof Error ? error.message : t("permsUpdateError"), "error");
    } finally {
      setIsUpdatingPerms(false);
    }
  };

  const canCreateUser = role === "admin" || role === "user";

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase();
  };

  return (
    <div className="space-y-4">
      <Panel
        title={t("innoecoUsers")}
        subtitle={t("manageUsersSubtitle")}
        action={canCreateUser ? (
          <button
            type="button"
            onClick={openCreateUser}
            className="rounded-xl bg-[linear-gradient(120deg,#0b3b62,#176ea5)] px-3 py-2 text-xs font-semibold text-white shadow-[0_12px_24px_rgba(22,99,156,0.35)] transition hover:brightness-110"
          >
            {t("addUserBtn")}
          </button>
        ) : null}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-240 text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                <th className="py-2">{t("avatarCol")}</th>
                <th className="py-2">{t("fullName")}</th>
                <th className="py-2">{t("emailAddress")}</th>
                <th className="py-2">{t("permissionsCol")}</th>
                <th className="py-2">{t("statusCol")}</th>
                <th className="py-2">{t("actionCol")}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const isSelf = currentEmail && user.email === currentEmail;
                return (
                  <tr key={user.id} className="border-b border-slate-200/70">
                    <td className="py-2">
                      {user.avatarUrl ? (
                        <div className="relative h-10 w-10 overflow-hidden rounded-lg border border-slate-200">
                          <Image
                            src={user.avatarUrl}
                            alt={`${user.name}`}
                            fill
                            className="object-cover"
                          />
                        </div>
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-sky-100 text-xs font-semibold text-sky-700">
                          {getInitials(user.name, user.email)}
                        </div>
                      )}
                    </td>
                    <td className="py-2 font-medium text-foreground">{user.name.trim()}</td>
                    <td className="py-2 text-slate-600">{user.email}</td>
                    <td className="py-2 text-slate-600">
                      <span className="truncate max-w-30 inline-block" title={formatPermissionsLabel(user.devicePermissions, t)}>
                        {formatPermissionsLabel(user.devicePermissions, t)}
                      </span>
                    </td>
                    <td className="py-2 text-slate-600">{formatStateLabel(user.state, t)}</td>
                    <td className="py-2">
                      {isSelf ? (
                        <span className="text-slate-500">-</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <select
                            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5"
                            value={user.state}
                            disabled={updatingUserId === user.id}
                            onChange={(event) => void updateState(user.id, event.target.value as UserDto["state"])}
                          >
                            {states.map((state) => (
                              <option key={state} value={state}>
                                {formatStateLabel(state, t)}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => openPermissionsModal(user)}
                            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition"
                          >
                            {t("manageBtn")}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {message && !isCreateOpen && !isPermsOpen ? <p className="text-sm text-slate-600">{message}</p> : null}

      {/* Modal tạo User */}
      {isCreateOpen ? (
        <div
          role="presentation"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeCreateUser();
            }
          }}
        >
          <form
            onSubmit={createUser}
            className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.25)]"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold text-foreground">{t("addNewUserTitle")}</h3>
                <p className="mt-1 text-sm text-slate-600">{t("addNewUserDesc")}</p>
              </div>
              <button
                type="button"
                onClick={closeCreateUser}
                className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-600 transition hover:bg-slate-100"
              >
                {t("closeBtn")}
              </button>
            </div>

            <div className="mt-5 grid gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">{t("emailAddress")}</label>
                <input
                  type="email"
                  required
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none transition focus:border-sky-500"
                  value={createForm.email}
                  onChange={(event) => setCreateForm((current) => ({ ...current, email: event.target.value }))}
                  placeholder={t("userEmailPlaceholder")}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">{t("passwordLabel")}</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none transition focus:border-sky-500"
                  value={createForm.password}
                  onChange={(event) => setCreateForm((current) => ({ ...current, password: event.target.value }))}
                  placeholder={t("min8Chars")}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">{t("fullName")}</label>
                <input
                  type="text"
                  required
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none transition focus:border-sky-500"
                  value={createForm.name}
                  onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder={t("egJaneDoe")}
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={closeCreateUser}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                {t("cancel")}
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-xl bg-[linear-gradient(120deg,#0b3b62,#176ea5)] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(22,99,156,0.35)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? t("creating") : t("createUserBtn")}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {/* Modal cấp quyền (Permissions) */}
      {isPermsOpen && selectedUserForPerms ? (
        <div
          role="presentation"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm"
          onClick={(event) => {
            if (event.target === event.currentTarget) closePermissionsModal();
          }}
        >
          <form
            onSubmit={savePermissions}
            className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.25)]"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold text-foreground">{t("devicePermsTitle")}</h3>
                <p className="mt-1 text-sm text-slate-600">
                  {t("updateAccessControlsFor")} <span className="font-semibold text-slate-800">{selectedUserForPerms.name}</span>.
                </p>
              </div>
              <button
                type="button"
                onClick={closePermissionsModal}
                className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-600 transition hover:bg-slate-100"
              >
                {t("closeBtn")}
              </button>
            </div>

            <div className="mt-5 space-y-3">
              {devicePermissionsList.map((perm) => {
                const isRequired = perm.key === "VIEW_DEVICE";
                const isChecked = permissionsForm.includes(perm.key);
                
                return (
                  <label
                    key={perm.key}
                    className={`flex items-start gap-3 rounded-xl border p-4 transition ${
                      isRequired 
                        ? 'border-slate-200 bg-slate-50 cursor-not-allowed opacity-80' 
                        : 'border-slate-200 bg-white cursor-pointer hover:bg-slate-50'
                    } ${isChecked && !isRequired ? 'border-sky-300 bg-sky-50/50' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => togglePermission(perm.key)}
                      disabled={isRequired}
                      className="mt-1 h-5 w-5 rounded border-slate-300 text-sky-600 focus:ring-sky-600 disabled:opacity-50"
                    />
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{perm.label}</div>
                      <div className="mt-0.5 text-xs text-slate-500">{perm.description}</div>
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-200 pt-5">
              <div className="text-sm text-slate-600">
                {message && <span className="text-emerald-600">{message}</span>}
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={closePermissionsModal}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  {t("cancel")}
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingPerms}
                  className="rounded-xl bg-[linear-gradient(120deg,#0b3b62,#176ea5)] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(22,99,156,0.35)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isUpdatingPerms ? t("saving") : t("savePermsBtn")}
                </button>
              </div>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
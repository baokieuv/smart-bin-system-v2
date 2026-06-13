"use client";

import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";
import Panel from "@/components/ui/panel";
import { unwrapListPayload } from "@/lib/admin-utils";
import { getRecaptchaToken } from "@/lib/recaptcha";
import { usersAdminApi } from "@/services/api/users-admin";
import type { CreateUserRequest } from "@/types/auth";
import type { UserDto } from "@/types/user";

const states: UserDto["state"][] = ["ACTIVE", "PENDING", "SUSPENDED", "DELETED"];

const DEVICE_PERMISSIONS = [
  { key: "VIEW_DEVICE", label: "View Devices", description: "Can view device details and telemetry (Default)" },
  { key: "EDIT_DEVICE", label: "Edit Devices", description: "Can update device configurations and settings" },
  { key: "DELETE_DEVICE", label: "Delete Devices", description: "Can remove devices from the system" },
  { key: "CONTROL_DEVICE", label: "Control Devices", description: "Can execute RPC commands (e.g., Open/Close Lid)" },
];

const formatStateLabel = (state: UserDto["state"]) => {
  switch (state) {
    case "ACTIVE":
      return "Active";
    case "PENDING":
      return "Pending";
    case "SUSPENDED":
      return "Suspended";
    case "DELETED":
      return "Deleted";
    default:
      return state;
  }
};

const formatPermissionsLabel = (perms?: string[]) => {
  if (!perms || perms.length === 0) return "View";
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
  const [users, setUsers] = useState<UserDto[]>([]);
  const [message, setMessage] = useState("");
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

  const load = async () => {
    const response = await usersAdminApi.getUsers({ page: 1, size: 100 });
    setUsers(unwrapListPayload(response.data));
  };

  useEffect(() => {
    void load().catch((error) => {
      setMessage(error instanceof Error ? error.message : "Oops! We couldn't load the user list.");
    });
    const email = typeof window !== "undefined" ? localStorage.getItem("admin_email") : null;
    setCurrentEmail(email);
  }, []);

  const updateState = async (id: string, state: UserDto["state"]) => {
    try {
      setUpdatingUserId(id);
      await usersAdminApi.updateUserState(id, state);
      setMessage(`User status successfully updated to ${formatStateLabel(state)}!`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "We couldn't update the user's status right now.");
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
      setMessage("New InnoEco user created successfully!");
      setIsCreateOpen(false);
      setCreateForm(emptyCreateUserForm);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "We couldn't create the user at this time.");
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
      // Giả sử service của bạn đã có hàm updateUserPermissions
      // Nếu API gộp chung vào updateUser, hãy sửa lại thành: usersAdminApi.updateUser(...)
      await usersAdminApi.updateUserPermissions(selectedUserForPerms.id, permissionsForm);
      setMessage(`Permissions successfully updated for ${selectedUserForPerms.name}!`);
      setIsPermsOpen(false);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "We couldn't update the permissions right now.");
    } finally {
      setIsUpdatingPerms(false);
    }
  };

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase();
  };

  return (
    <div className="space-y-4">
      <Panel
        title="InnoEco Users"
        subtitle="Manage user accounts, access states, and device permissions"
        action={
          <button
            type="button"
            onClick={openCreateUser}
            className="rounded-xl bg-[linear-gradient(120deg,#0b3b62,#176ea5)] px-3 py-2 text-xs font-semibold text-white shadow-[0_12px_24px_rgba(22,99,156,0.35)] transition hover:brightness-110"
          >
            Add User
          </button>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-240 text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                <th className="py-2">Avatar</th>
                <th className="py-2">Full Name</th>
                <th className="py-2">Email Address</th>
                <th className="py-2">Permissions</th>
                <th className="py-2">Status</th>
                <th className="py-2">Action</th>
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
                      <span className="truncate max-w-[120px] inline-block" title={formatPermissionsLabel(user.devicePermissions)}>
                        {formatPermissionsLabel(user.devicePermissions)}
                      </span>
                    </td>
                    <td className="py-2 text-slate-600">{formatStateLabel(user.state)}</td>
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
                                {formatStateLabel(state)}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => openPermissionsModal(user)}
                            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition"
                          >
                            Manage
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
                <h3 className="text-xl font-semibold text-foreground">Add New User</h3>
                <p className="mt-1 text-sm text-slate-600">Provide the user's basic details. The system will handle authentication automatically.</p>
              </div>
              <button
                type="button"
                onClick={closeCreateUser}
                className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-600 transition hover:bg-slate-100"
              >
                Close
              </button>
            </div>

            <div className="mt-5 grid gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Email Address</label>
                <input
                  type="email"
                  required
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none transition focus:border-sky-500"
                  value={createForm.email}
                  onChange={(event) => setCreateForm((current) => ({ ...current, email: event.target.value }))}
                  placeholder="user@innoeco.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Password</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none transition focus:border-sky-500"
                  value={createForm.password}
                  onChange={(event) => setCreateForm((current) => ({ ...current, password: event.target.value }))}
                  placeholder="At least 8 characters"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Full Name</label>
                <input
                  type="text"
                  required
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none transition focus:border-sky-500"
                  value={createForm.name}
                  onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="e.g. Jane Doe"
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={closeCreateUser}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-xl bg-[linear-gradient(120deg,#0b3b62,#176ea5)] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(22,99,156,0.35)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Creating..." : "Create User"}
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
                <h3 className="text-xl font-semibold text-foreground">Device Permissions</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Update access controls for <span className="font-semibold text-slate-800">{selectedUserForPerms.name}</span>.
                </p>
              </div>
              <button
                type="button"
                onClick={closePermissionsModal}
                className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-600 transition hover:bg-slate-100"
              >
                Close
              </button>
            </div>

            <div className="mt-5 space-y-3">
              {DEVICE_PERMISSIONS.map((perm) => {
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
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingPerms}
                  className="rounded-xl bg-[linear-gradient(120deg,#0b3b62,#176ea5)] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(22,99,156,0.35)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isUpdatingPerms ? "Saving..." : "Save Permissions"}
                </button>
              </div>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
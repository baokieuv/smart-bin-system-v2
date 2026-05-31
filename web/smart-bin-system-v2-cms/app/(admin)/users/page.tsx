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

const emptyCreateUserForm = {
  email: "",
  password: "",
  name: "",
};

export default function UsersPage() {
  const [users, setUsers] = useState<UserDto[]>([]);
  const [message, setMessage] = useState("");
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreateUserForm);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  const load = async () => {
    const response = await usersAdminApi.getUsers({ page: 1, size: 100 });
    setUsers(unwrapListPayload(response.data));
  };

  useEffect(() => {
    void load().catch((error) => {
      setMessage(error instanceof Error ? error.message : "Load failed");
    });
    const email = typeof window !== "undefined" ? localStorage.getItem("admin_email") : null;
    setCurrentEmail(email);
  }, []);

  const updateState = async (id: string, state: UserDto["state"]) => {
    try {
      setUpdatingUserId(id);
      await usersAdminApi.updateUserState(id, state);
      setMessage(`User ${id} updated to ${state}`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Update failed");
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
    if (isSubmitting) {
      return;
    }

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
      setMessage("User created successfully");
      setIsCreateOpen(false);
      setCreateForm(emptyCreateUserForm);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Create user failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase();
  };

  return (
    <div className="space-y-4">
      <Panel
        title="Users"
        subtitle="Admin moderation for account state"
        action={
          <button
            type="button"
            onClick={openCreateUser}
            className="rounded-xl bg-[linear-gradient(120deg,#0b3b62,#176ea5)] px-3 py-2 text-xs font-semibold text-white shadow-[0_12px_24px_rgba(22,99,156,0.35)] transition hover:brightness-110"
          >
            Add user
          </button>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-240 text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                <th className="py-2">Avatar</th>
                <th className="py-2">Full name</th>
                <th className="py-2">Email</th>
                <th className="py-2">State</th>
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
                    <td className="py-2 text-slate-600">{user.state}</td>
                    <td className="py-2">
                      {isSelf ? (
                        <span className="text-slate-500">-</span>
                      ) : (
                        <select
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1"
                          value={user.state}
                          disabled={updatingUserId === user.id}
                          onChange={(event) => void updateState(user.id, event.target.value as UserDto["state"])}
                        >
                          {states.map((state) => (
                            <option key={state} value={state}>
                              {state}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {message ? <p className="text-sm text-slate-600">{message}</p> : null}

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
                <h3 className="text-xl font-semibold text-foreground">Add user</h3>
                <p className="mt-1 text-sm text-slate-600">Email, password and name are required. reCAPTCHA is submitted automatically.</p>
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
                <label className="block text-sm font-medium text-slate-700">Email</label>
                <input
                  type="email"
                  required
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none transition focus:border-sky-500"
                  value={createForm.email}
                  onChange={(event) => setCreateForm((current) => ({ ...current, email: event.target.value }))}
                  placeholder="user@example.com"
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
                <label className="block text-sm font-medium text-slate-700">Name</label>
                <input
                  type="text"
                  required
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none transition focus:border-sky-500"
                  value={createForm.name}
                  onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Full name"
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
                {isSubmitting ? "Creating..." : "Create user"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}


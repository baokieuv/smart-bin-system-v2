"use client";

import { FormEvent, useEffect, useState } from "react";
import Panel from "@/components/ui/panel";
import { authApi } from "@/services/api/auth";
import type { AdminSessionUser } from "@/types/auth";

const emptyProfile = {
  name: "",
  email: "",
};

export default function SettingsPage() {
  const [profile, setProfile] = useState(emptyProfile);
  const [profileMessage, setProfileMessage] = useState("");
  const [profileLoading, setProfileLoading] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [role, setRole] = useState<string>("");

  useEffect(() => {
    const load = async () => {
      const response = await authApi.me();
      const user = response.data as AdminSessionUser;

      setProfile({
        name: user.name || localStorage.getItem("admin_name") || "",
        email: user.email || localStorage.getItem("admin_email") || "",
      });
      setRole(user.role || localStorage.getItem("admin_role") || "");
    };

    void load().catch((error) => {
      setProfileMessage(error instanceof Error ? error.message : "Unable to load profile");
    });
  }, []);

  const updateProfile = async (event: FormEvent) => {
    event.preventDefault();
    setProfileLoading(true);
    setProfileMessage("");

    try {
      const name = profile.name.trim();
      const response = await authApi.updateMe({ name });
      const user = response.data as AdminSessionUser;
      const nextEmail = user.email || profile.email;
      const nextName = user.name || name;

      setProfile({
        name: nextName,
        email: nextEmail,
      });
      localStorage.setItem("admin_name", nextName);
      localStorage.setItem("admin_email", nextEmail);
      setProfileMessage("Profile updated successfully");
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : "Update profile failed");
    } finally {
      setProfileLoading(false);
    }
  };

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    setPasswordMessage("");

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordMessage("New password and confirmation do not match");
      return;
    }

    setPasswordLoading(true);

    try {
      await authApi.changePassword({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
        confirmPassword: passwordForm.confirmPassword,
      });

      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setPasswordMessage("Password changed successfully");
    } catch (error) {
      setPasswordMessage(error instanceof Error ? error.message : "Change password failed");
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Panel title="Settings" subtitle="Update your profile or change password">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Account</p>
            <p className="mt-2 text-lg font-semibold text-foreground">{profile.email || "-"}</p>
            <p className="mt-1 text-sm text-slate-600">{role ? role.replaceAll("_", " ") : "Role loading..."}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Profile</p>
            <p className="mt-2 text-lg font-semibold text-foreground">{profile.name || "Unnamed admin"}</p>
            <p className="mt-1 text-sm text-slate-600">Edit your basic account details from the form below.</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Password</p>
            <p className="mt-2 text-lg font-semibold text-foreground">Keep it secure</p>
            <p className="mt-1 text-sm text-slate-600">Change your password without leaving the CMS.</p>
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Update Profile" subtitle="Edit name and email">
          <form className="space-y-4" onSubmit={updateProfile}>
            <div>
              <label className="block text-sm font-medium text-slate-700">Name</label>
              <input
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none transition focus:border-sky-500"
                value={profile.name}
                onChange={(event) => setProfile((current) => ({ ...current, name: event.target.value }))}
                placeholder="Full name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Email</label>
              <input
                readOnly
                className="mt-2 w-full rounded-xl border border-slate-300 bg-slate-100 px-4 py-2.5 text-slate-600 outline-none"
                value={profile.email}
                placeholder="admin@smartbin.vn"
              />
            </div>

            {profileMessage ? <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{profileMessage}</p> : null}

            <button
              type="submit"
              disabled={profileLoading}
              className="rounded-xl bg-[linear-gradient(120deg,#0b3b62,#176ea5)] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(22,99,156,0.35)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {profileLoading ? "Saving..." : "Save profile"}
            </button>
          </form>
        </Panel>

        <Panel title="Change Password" subtitle="Update your login password">
          <form className="space-y-4" onSubmit={changePassword}>
            <div>
              <label className="block text-sm font-medium text-slate-700">Current password</label>
              <input
                type="password"
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none transition focus:border-sky-500"
                value={passwordForm.currentPassword}
                onChange={(event) => setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))}
                placeholder="Current password"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-700">New password</label>
                <input
                  type="password"
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none transition focus:border-sky-500"
                  value={passwordForm.newPassword}
                  onChange={(event) => setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))}
                  placeholder="New password"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Confirm password</label>
                <input
                  type="password"
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none transition focus:border-sky-500"
                  value={passwordForm.confirmPassword}
                  onChange={(event) => setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                  placeholder="Confirm password"
                />
              </div>
            </div>

            {passwordMessage ? <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{passwordMessage}</p> : null}

            <button
              type="submit"
              disabled={passwordLoading}
              className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm font-semibold text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {passwordLoading ? "Updating..." : "Change password"}
            </button>
          </form>
        </Panel>
      </div>
    </div>
  );
}

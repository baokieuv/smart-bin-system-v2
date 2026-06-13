"use client";

import type { ChangeEvent, FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Cropper, { type Area } from "react-easy-crop";
import Modal from "@/components/ui/modal";
import Panel from "@/components/ui/panel";
import { authApi } from "@/services/api/auth";
import { usersApi } from "@/services/api/users";
import { getCroppedImg } from "@/utils/cropImage";
import type { UserDto } from "@/types/user";

const emptyPasswordForm = { currentPassword: "", newPassword: "", confirmPassword: "" };

const withAvatarCacheBuster = (avatarUrl?: string) => {
  if (!avatarUrl) return avatarUrl;

  const sanitizedUrl = usersApi.sanitizeAvatarUrl(avatarUrl);
  if (!sanitizedUrl) return avatarUrl;

  const separator = sanitizedUrl.includes("?") ? "&" : "?";
  return `${sanitizedUrl}${separator}v=${Math.floor(Math.random() * 1_000_000_000)}`;
};

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result ?? "")));
    reader.addEventListener("error", () => reject(new Error("Unable to read selected image.")));
    reader.readAsDataURL(file);
  });

const extractUploadUrl = (data: unknown) => {
  if (typeof data === "string") return data.trim();

  if (!data || typeof data !== "object") return "";

  const payload = data as Record<string, unknown>;
  const candidateKeys = ["objectUrl", "avatarUrl", "url", "publicUrl", "fileUrl", "downloadUrl", "location", "path"];

  for (const key of candidateKeys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
};

export default function SettingsPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const CropperComponent = Cropper;
  const [profile, setProfile] = useState<UserDto | null>(null);
  const [profileMessage, setProfileMessage] = useState("");
  const [profileLoading, setProfileLoading] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordForm, setPasswordForm] = useState(emptyPasswordForm);
  const [role, setRole] = useState("");
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  useEffect(() => {
    const load = async () => {
      const response = await usersApi.me();
      const user = response.data;

      setProfile({
        ...user,
        avatarUrl: user.avatarUrl ? withAvatarCacheBuster(user.avatarUrl) : undefined,
      });
      setRole(user.userRole || localStorage.getItem("admin_role") || "");
    };

    void load().catch((error) => {
      setProfileMessage(error instanceof Error ? error.message : "We couldn't load your profile details right now.");
    });
  }, []);

  const openProfileModal = () => {
    setProfileMessage("");
    setShowProfileModal(true);
  };

  const closeProfileModal = () => {
    if (profileLoading) return;
    setShowProfileModal(false);
  };

  const openPasswordModal = () => {
    setPasswordMessage("");
    setShowPasswordModal(true);
  };

  const closePasswordModal = () => {
    if (passwordLoading) return;
    setShowPasswordModal(false);
    setPasswordForm(emptyPasswordForm);
  };

  const openAvatarPicker = () => {
    fileInputRef.current?.click();
  };

  const onAvatarFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setImageSrc(dataUrl);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : "We couldn't load the selected avatar.");
    }
  };

  const saveAvatar = async () => {
    if (!profile || !imageSrc || !croppedAreaPixels) return;

    setIsUploadingAvatar(true);
    setProfileMessage("");

    try {
      const croppedBlob = await getCroppedImg(imageSrc, croppedAreaPixels);
      if (!croppedBlob) {
        throw new Error("Unable to crop the selected image.");
      }

      const croppedFile = new File([croppedBlob], "avatar.jpg", { type: "image/jpeg" });
      const oldObjectName = profile.avatarUrl ? usersApi.toObjectNameFromAvatarUrl(profile.avatarUrl) : "";
      const uploadResponse = await usersApi.uploadAvatar(croppedFile, {
        folder: "avatars",
        oldObjectName: oldObjectName || undefined,
      });

      const avatarUrl = extractUploadUrl(uploadResponse.data);
      if (!avatarUrl) {
        throw new Error("We couldn't resolve the uploaded avatar URL.");
      }

      const updateResponse = await usersApi.update({
        name: profile.name.trim(),
        avatarUrl,
      });

      setProfile({
        ...updateResponse.data,
        avatarUrl: updateResponse.data.avatarUrl ? withAvatarCacheBuster(updateResponse.data.avatarUrl) : undefined,
      });
      setProfileMessage("Avatar updated successfully.");
      setImageSrc(null);
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : "We couldn't update your avatar right now.");
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const updateProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (!profile) return;

    setProfileLoading(true);
    setProfileMessage("");

    try {
      const response = await usersApi.update({
        name: profile.name.trim(),
        avatarUrl: profile.avatarUrl ? usersApi.sanitizeAvatarUrl(profile.avatarUrl) : undefined,
      });

      setProfile({
        ...response.data,
        avatarUrl: response.data.avatarUrl ? withAvatarCacheBuster(response.data.avatarUrl) : undefined,
      });
      localStorage.setItem("admin_name", response.data.name || profile.name.trim());
      localStorage.setItem("admin_email", response.data.email || profile.email);
      setProfileMessage("Profile updated successfully!");
      setShowProfileModal(false);
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : "Oops! We couldn't update your profile.");
    } finally {
      setProfileLoading(false);
    }
  };

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    setPasswordMessage("");

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordMessage("Oops! Your new passwords don't match.");
      return;
    }

    setPasswordLoading(true);

    try {
      await authApi.changePassword({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
        confirmPassword: passwordForm.confirmPassword,
      });

      setPasswordForm(emptyPasswordForm);
      setPasswordMessage("Your password has been changed successfully!");
    } catch (error) {
      setPasswordMessage(error instanceof Error ? error.message : "We couldn't change your password right now.");
    } finally {
      setPasswordLoading(false);
    }
  };

  const fullName = profile?.name?.trim() || "Unnamed User";
  const userInitial = (profile?.name || profile?.email || "U").slice(0, 1).toUpperCase();

  return (
    <div className="space-y-4">
      <Panel title="InnoEco Settings" subtitle="Manage your profile details, avatar, and security preferences">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 md:col-span-1">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Account</p>
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={openAvatarPicker}
                className="relative h-16 w-16 overflow-hidden rounded-full border border-slate-300 bg-white text-lg font-semibold text-slate-700"
                aria-label="Change avatar"
              >
                {profile?.avatarUrl ? (
                  <Image src={profile.avatarUrl} alt={fullName} fill className="object-cover" sizes="64px" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center bg-sky-100 text-sky-700">{userInitial}</span>
                )}
              </button>

              <div>
                <p className="text-lg font-semibold text-foreground">{profile?.email || "-"}</p>
                <p className="text-sm text-slate-600">{role ? role.replaceAll("_", " ") : "Loading role..."}</p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={openAvatarPicker}
                className="rounded-xl bg-[linear-gradient(120deg,#0b3b62,#176ea5)] px-3 py-2 text-xs font-semibold text-white shadow-[0_12px_24px_rgba(22,99,156,0.35)] transition hover:brightness-110"
              >
                Change Avatar
              </button>
              <button
                type="button"
                onClick={openProfileModal}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                Edit Profile
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Profile Info</p>
            <p className="mt-2 text-lg font-semibold text-foreground">{fullName}</p>
            <p className="mt-1 text-sm text-slate-600">Keep your workspace identity up to date.</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Security</p>
            <p className="mt-2 text-lg font-semibold text-foreground">Stay secure</p>
            <p className="mt-1 text-sm text-slate-600">Update your password to keep your InnoEco dashboard safe.</p>
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel
          title="Update Profile"
          subtitle="Edit your display name and avatar"
          action={
            <button type="button" onClick={openProfileModal} className="rounded-xl bg-[linear-gradient(120deg,#0b3b62,#176ea5)] px-3 py-2 text-xs font-semibold text-white">
              Edit Profile
            </button>
          }
        >
          <p className="text-sm text-slate-600">Launch the editor to update your personal details.</p>
        </Panel>

        <Panel
          title="Change Password"
          subtitle="Update your login password"
          action={
            <button type="button" onClick={openPasswordModal} className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700">
              Change Password
            </button>
          }
        >
          <p className="text-sm text-slate-600">Open the security panel to set a new password.</p>
        </Panel>
      </div>

      {showProfileModal ? (
        <Modal title="Update Profile" subtitle="Edit your display name" onClose={closeProfileModal}>
          <form className="space-y-4" onSubmit={updateProfile}>
            <div>
              <label className="block text-sm font-medium text-slate-700">Full Name</label>
              <input
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none transition focus:border-sky-500"
                value={profile?.name || ""}
                onChange={(event) => setProfile((current) => (current ? { ...current, name: event.target.value } : current))}
                placeholder="Your full name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Email Address</label>
              <input
                readOnly
                className="mt-2 w-full rounded-xl border border-slate-300 bg-slate-100 px-4 py-2.5 text-slate-600 outline-none"
                value={profile?.email || ""}
                placeholder="admin@innoeco.com"
              />
            </div>

            <div className="flex items-center gap-2 border-t border-slate-200 pt-4">
              <button
                type="submit"
                disabled={profileLoading}
                className="rounded-xl bg-[linear-gradient(120deg,#0b3b62,#176ea5)] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(22,99,156,0.35)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {profileLoading ? "Saving..." : "Save Profile"}
              </button>
              <button type="button" className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm" onClick={closeProfileModal}>
                Cancel
              </button>
              {profileMessage ? <p className="text-sm text-slate-700">{profileMessage}</p> : null}
            </div>
          </form>
        </Modal>
      ) : null}

      {showPasswordModal ? (
        <Modal title="Change Password" subtitle="Update your login password securely" onClose={closePasswordModal}>
          <form className="space-y-4" onSubmit={changePassword}>
            <div>
              <label className="block text-sm font-medium text-slate-700">Current Password</label>
              <input
                type="password"
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none transition focus:border-sky-500"
                value={passwordForm.currentPassword}
                onChange={(event) => setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))}
                placeholder="Enter current password"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-700">New Password</label>
                <input
                  type="password"
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none transition focus:border-sky-500"
                  value={passwordForm.newPassword}
                  onChange={(event) => setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))}
                  placeholder="Enter new password"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Confirm New Password</label>
                <input
                  type="password"
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none transition focus:border-sky-500"
                  value={passwordForm.confirmPassword}
                  onChange={(event) => setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                  placeholder="Confirm new password"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 border-t border-slate-200 pt-4">
              <button
                type="submit"
                disabled={passwordLoading}
                className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm font-semibold text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {passwordLoading ? "Updating..." : "Update Password"}
              </button>
              <button type="button" className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm" onClick={closePasswordModal}>
                Cancel
              </button>
              {passwordMessage ? <p className="text-sm text-slate-700">{passwordMessage}</p> : null}
            </div>
          </form>
        </Modal>
      ) : null}

      {imageSrc ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900">Update Avatar</h3>

            <div className="relative mt-4 h-72 w-full overflow-hidden rounded-lg bg-slate-100">
              <CropperComponent
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_croppedArea: Area, croppedPixels: Area) => setCroppedAreaPixels(croppedPixels)}
              />
            </div>

            <div className="mt-4">
              <label className="mb-1 block text-sm font-semibold text-slate-700">Zoom</label>
              <input
                type="range"
                min={1}
                max={3}
                step={0.1}
                value={zoom}
                onChange={(event) => setZoom(Number(event.target.value))}
                className="w-full"
              />
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setImageSrc(null)}
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                disabled={isUploadingAvatar}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveAvatar()}
                className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
                disabled={isUploadingAvatar}
              >
                {isUploadingAvatar ? "Updating..." : "Save Avatar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {!showProfileModal && !showPasswordModal && (profileMessage || passwordMessage) ? (
        <div className="space-y-2">
          {profileMessage ? <p className="text-sm text-slate-600">{profileMessage}</p> : null}
          {passwordMessage ? <p className="text-sm text-slate-600">{passwordMessage}</p> : null}
        </div>
      ) : null}

      <input ref={fileInputRef} type="file" accept="image/png, image/jpeg, image/jpg" className="hidden" onChange={onAvatarFileChange} />
    </div>
  );
}
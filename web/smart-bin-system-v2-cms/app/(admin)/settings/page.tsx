"use client";

import type { ChangeEvent, FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Cropper, { type Area } from "react-easy-crop";
import Modal from "@/components/ui/modal";
import Panel from "@/components/ui/panel";
import { authApi } from "@/services/api/auth";
import { usersApi } from "@/services/api/users";
import { useLanguage } from "@/lib/language";
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
    reader.addEventListener("error", () => reject(new Error("FILE_READ_ERROR")));
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
  const { t, language, setLanguage, languageLabels } = useLanguage();
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
      setProfileMessage(error instanceof Error ? error.message : (t as any)("errorLoadProfile"));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      if (error instanceof Error && error.message === "FILE_READ_ERROR") {
        setProfileMessage((t as any)("errorReadImage"));
      } else {
        setProfileMessage(error instanceof Error ? error.message : (t as any)("errorLoadAvatar"));
      }
    }
  };

  const saveAvatar = async () => {
    if (!profile || !imageSrc || !croppedAreaPixels) return;

    setIsUploadingAvatar(true);
    setProfileMessage("");

    try {
      const croppedBlob = await getCroppedImg(imageSrc, croppedAreaPixels);
      if (!croppedBlob) {
        throw new Error((t as any)("errorCropImage"));
      }

      const croppedFile = new File([croppedBlob], "avatar.jpg", { type: "image/jpeg" });
      const oldObjectName = profile.avatarUrl ? usersApi.toObjectNameFromAvatarUrl(profile.avatarUrl) : "";
      const uploadResponse = await usersApi.uploadAvatar(croppedFile, {
        folder: "avatars",
        oldObjectName: oldObjectName || undefined,
      });

      const avatarUrl = extractUploadUrl(uploadResponse.data);
      if (!avatarUrl) {
        throw new Error((t as any)("errorResolveAvatarUrl"));
      }

      const updateResponse = await usersApi.update({
        name: profile.name.trim(),
        avatarUrl,
      });

      setProfile({
        ...updateResponse.data,
        avatarUrl: updateResponse.data.avatarUrl ? withAvatarCacheBuster(updateResponse.data.avatarUrl) : undefined,
      });
      setProfileMessage(t("avatarUpdated"));
      setImageSrc(null);
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : (t as any)("errorUpdateAvatar"));
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
      setProfileMessage(t("profileUpdated"));
      setShowProfileModal(false);
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : (t as any)("errorUpdateProfile"));
    } finally {
      setProfileLoading(false);
    }
  };

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    setPasswordMessage("");

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordMessage((t as any)("errorPasswordsNotMatch"));
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
      setPasswordMessage(t("passwordChanged"));
    } catch (error) {
      setPasswordMessage(error instanceof Error ? error.message : (t as any)("errorChangePassword"));
    } finally {
      setPasswordLoading(false);
    }
  };

  const fullName = profile?.name?.trim() || (t as any)("unnamedUser");
  const userInitial = (profile?.name || profile?.email || "U").slice(0, 1).toUpperCase();

  return (
    <div className="space-y-4">
      <Panel title={(t as any)("settingsTitle")} subtitle={t("manageProfile")}>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 md:col-span-1">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{(t as any)("accountLabel")}</p>
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={openAvatarPicker}
                className="relative h-16 w-16 overflow-hidden rounded-full border border-slate-300 bg-white text-lg font-semibold text-slate-700"
                aria-label={t("changeAvatar")}
              >
                {profile?.avatarUrl ? (
                  <Image src={profile.avatarUrl} alt={fullName} fill className="object-cover" sizes="64px" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center bg-sky-100 text-sky-700">{userInitial}</span>
                )}
              </button>

              <div>
                <p className="text-lg font-semibold text-foreground">{profile?.email || "-"}</p>
                <p className="text-sm text-slate-600">{role ? role.replaceAll("_", " ") : t("loadingRole")}</p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={openAvatarPicker}
                className="rounded-xl bg-[linear-gradient(120deg,#0b3b62,#176ea5)] px-3 py-2 text-xs font-semibold text-white shadow-[0_12px_24px_rgba(22,99,156,0.35)] transition hover:brightness-110"
              >
                {t("changeAvatar")}
              </button>
              <button
                type="button"
                onClick={openProfileModal}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                {t("editProfile")}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{t("profileInfo")}</p>
            <p className="mt-2 text-lg font-semibold text-foreground">{fullName}</p>
            <p className="mt-1 text-sm text-slate-600">{t("profileInfoDescription")}</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{t("security")}</p>
            <p className="mt-2 text-lg font-semibold text-foreground">{t("staySecure")}</p>
            <p className="mt-1 text-sm text-slate-600">{t("securityDescription")}</p>
          </div>
        </div>
      </Panel>

      {/* <Panel title={t("chooseLanguage")} subtitle={t("languageDescription")}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-700">{t("currentLanguage")}</p>
            <p className="text-sm text-slate-600">{languageLabels[language]}</p>
          </div>
          <select
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm outline-none sm:max-w-xs"
            value={language}
            onChange={(event) => setLanguage(event.target.value === "vi" ? "vi" : "en")}
          >
            <option value="en">{languageLabels.en}</option>
            <option value="vi">{languageLabels.vi}</option>
          </select>
        </div>
      </Panel> */}

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel
          title={t("updateProfile")}
          subtitle={t("editYourDetails")}
          action={
            <button type="button" onClick={openProfileModal} className="rounded-xl bg-[linear-gradient(120deg,#0b3b62,#176ea5)] px-3 py-2 text-xs font-semibold text-white">
              {t("editProfile")}
            </button>
          }
        >
          <p className="text-sm text-slate-600">{(t as any)("launchEditor")}</p>
        </Panel>

        <Panel
          title={t("changePassword")}
          subtitle={t("updateLoginPassword")}
          action={
            <button type="button" onClick={openPasswordModal} className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700">
              {t("changePassword")}
            </button>
          }
        >
          <p className="text-sm text-slate-600">{(t as any)("openSecurityPanel")}</p>
        </Panel>
      </div>

      {showProfileModal ? (
        <Modal title={t("updateProfile")} subtitle={t("editYourDetails")} onClose={closeProfileModal}>
          <form className="space-y-4" onSubmit={updateProfile}>
            <div>
              <label className="block text-sm font-medium text-slate-700">{t("fullName")}</label>
              <input
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none transition focus:border-sky-500"
                value={profile?.name || ""}
                onChange={(event) => setProfile((current) => (current ? { ...current, name: event.target.value } : current))}
                placeholder={(t as any)("yourFullName")}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">{t("emailAddress")}</label>
              <input
                readOnly
                className="mt-2 w-full rounded-xl border border-slate-300 bg-slate-100 px-4 py-2.5 text-slate-600 outline-none"
                value={profile?.email || ""}
                placeholder={(t as any)("adminEmail")}
              />
            </div>

            <div className="flex items-center gap-2 border-t border-slate-200 pt-4">
              <button
                type="submit"
                disabled={profileLoading}
                className="rounded-xl bg-[linear-gradient(120deg,#0b3b62,#176ea5)] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(22,99,156,0.35)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {profileLoading ? t("saving") : t("saveProfile")}
              </button>
              <button type="button" className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm" onClick={closeProfileModal}>
                {t("cancel")}
              </button>
              {profileMessage ? <p className="text-sm text-slate-700">{profileMessage}</p> : null}
            </div>
          </form>
        </Modal>
      ) : null}

      {showPasswordModal ? (
        <Modal title={t("changePassword")} subtitle={t("updateLoginPassword")} onClose={closePasswordModal}>
          <form className="space-y-4" onSubmit={changePassword}>
            <div>
              <label className="block text-sm font-medium text-slate-700">{t("currentPassword")}</label>
              <input
                type="password"
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none transition focus:border-sky-500"
                value={passwordForm.currentPassword}
                onChange={(event) => setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))}
                placeholder={(t as any)("enterCurrentPassword")}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-700">{t("newPassword")}</label>
                <input
                  type="password"
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none transition focus:border-sky-500"
                  value={passwordForm.newPassword}
                  onChange={(event) => setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))}
                  placeholder={(t as any)("enterNewPassword")}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">{t("confirmNewPassword")}</label>
                <input
                  type="password"
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none transition focus:border-sky-500"
                  value={passwordForm.confirmPassword}
                  onChange={(event) => setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                  placeholder={t("confirmPassword")}
                />
              </div>
            </div>

            <div className="flex items-center gap-2 border-t border-slate-200 pt-4">
              <button
                type="submit"
                disabled={passwordLoading}
                className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm font-semibold text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {passwordLoading ? (t as any)("updating") : t("changePassword")}
              </button>
              <button type="button" className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm" onClick={closePasswordModal}>
                {t("cancel")}
              </button>
              {passwordMessage ? <p className="text-sm text-slate-700">{passwordMessage}</p> : null}
            </div>
          </form>
        </Modal>
      ) : null}

      {imageSrc ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900">{t("updateAvatar")}</h3>

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
              <label className="mb-1 block text-sm font-semibold text-slate-700">{t("zoom")}</label>
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
                {t("cancel")}
              </button>
              <button
                type="button"
                onClick={() => void saveAvatar()}
                className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
                disabled={isUploadingAvatar}
              >
                {isUploadingAvatar ? (t as any)("updating") : t("updateAvatarButton")}
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
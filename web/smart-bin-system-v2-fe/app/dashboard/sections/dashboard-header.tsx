'use client';

import Link from 'next/link';
import { ChangeEvent, RefObject } from 'react';
import { UserDto } from '@/types/user';

type DashboardHeaderProps = {
  userInfo: UserDto | null;
  userInitial: string;
  isUploading: boolean;
  isSettingsOpen: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onToggleSettings: () => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onOpenAddDeviceFromSettings: () => void;
  onLogout: () => void;
};

export default function DashboardHeader({
  userInfo,
  userInitial,
  isUploading,
  isSettingsOpen,
  fileInputRef,
  onToggleSettings,
  onFileChange,
  onOpenAddDeviceFromSettings,
  onLogout,
}: DashboardHeaderProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3.5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Smart Bin Platform</p>
        <h1 className="text-xl font-bold text-slate-900 md:text-2xl">Device Dashboard</h1>
      </div>

      <div className="relative flex items-center gap-3">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="group relative"
          aria-label="Update avatar"
        >
          {userInfo?.avatarUrl ? (
            <img
              src={userInfo.avatarUrl}
              alt="User avatar"
              className={`h-11 w-11 rounded-full border border-slate-300 object-cover ${isUploading ? 'opacity-60' : ''}`}
            />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-300 bg-slate-200 font-bold text-slate-700">
              {userInitial}
            </div>
          )}

          <span className="pointer-events-none absolute inset-0 hidden items-center justify-center rounded-full bg-black/45 text-[10px] font-semibold text-white group-hover:flex">
            Edit
          </span>
        </button>

        <input
          ref={fileInputRef}
          type="file"
          onChange={onFileChange}
          accept="image/png, image/jpeg, image/jpg"
          className="hidden"
        />

        <button
          type="button"
          onClick={onToggleSettings}
          className="rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
        >
          User Settings
        </button>

        {isSettingsOpen && (
          <div className="absolute right-0 top-14 z-20 w-64 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
            <p className="text-sm font-semibold text-slate-900">{userInfo?.firstName} {userInfo?.lastName}</p>
            <p className="mb-3 text-xs text-slate-500">{userInfo?.email}</p>

            <div className="space-y-2">
              <Link
                href="#"
                onClick={(event) => {
                  event.preventDefault();
                  onOpenAddDeviceFromSettings();
                }}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-700" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Add Device
              </Link>
              <Link
                href="/auth/change-password"
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-700" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 0h10.5a2.25 2.25 0 012.25 2.25v6.75a2.25 2.25 0 01-2.25 2.25H6.75a2.25 2.25 0 01-2.25-2.25v-6.75a2.25 2.25 0 012.25-2.25z" />
                </svg>
                Change Password
              </Link>
              <button
                type="button"
                onClick={onLogout}
                className="flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-700" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-7.5a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 006 21h7.5a2.25 2.25 0 002.25-2.25V15m-3 0l3-3m0 0l-3-3m3 3H9" />
                </svg>
                Logout
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

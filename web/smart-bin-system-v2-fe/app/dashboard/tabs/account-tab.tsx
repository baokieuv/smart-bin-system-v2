'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserDto } from '@/types/user';

type AccountTabProps = {
  userInfo: UserDto | null;
  userInitial: string;
  isUploading: boolean;
  fullName: string;
  isEditingName: boolean;
  editableName: string;
  hasNameChanged: boolean;
  isUpdatingName: boolean;
  greeting: string;
  onPickAvatar: () => void;
  onStartEditingName: () => void;
  onChangeEditableName: (value: string) => void;
  onCancelEditingName: () => void;
  onConfirmNameChange: () => void;
  onFeatureComingSoon: () => void;
};

export default function AccountTab({
  userInfo,
  userInitial,
  isUploading,
  fullName,
  isEditingName,
  editableName,
  hasNameChanged,
  isUpdatingName,
  greeting,
  onPickAvatar,
  onStartEditingName,
  onChangeEditableName,
  onCancelEditingName,
  onConfirmNameChange,
  onFeatureComingSoon,
}: AccountTabProps) {
  return (
    <div className="grid w-full gap-4 lg:grid-cols-3">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-1">
        <div className="flex flex-col items-center text-center">
          <button
            type="button"
            onClick={onPickAvatar}
            className="group relative"
            aria-label="Edit account avatar"
          >
            {userInfo?.avatarUrl ? (
              <img
                src={userInfo.avatarUrl}
                alt="User avatar"
                className={`h-24 w-24 rounded-full border border-slate-300 object-cover ${isUploading ? 'opacity-60' : ''}`}
              />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-full border border-slate-300 bg-slate-200 text-3xl font-bold text-slate-700">
                {userInitial}
              </div>
            )}

            <span className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition group-hover:bg-slate-100">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7H4.25A2.25 2.25 0 002 9.25v8.5A2.25 2.25 0 004.25 20h15.5A2.25 2.25 0 0022 17.75v-8.5A2.25 2.25 0 0019.75 7h-.936a2.31 2.31 0 01-1.64-.675l-.759-.759A2.25 2.25 0 0014.824 5h-5.648a2.25 2.25 0 00-1.591.659l-.758.516z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
              </svg>
            </span>
          </button>

          <div className="mt-4 w-full">
            {!isEditingName ? (
              <div className="flex items-center justify-center gap-1">
                <h2 className="text-xl font-bold text-slate-900">{fullName}</h2>
                <button
                  type="button"
                  onClick={onStartEditingName}
                  className="p-0.5 text-slate-500 transition hover:text-slate-900"
                  aria-label="Edit name"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                  </svg>
                </button>
              </div>
            ) : (
              <div className="mx-auto max-w-xs space-y-2 text-left">
                <label htmlFor="account-name-input" className="block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
                  Full name
                </label>
                <Input
                  id="account-name-input"
                  value={editableName}
                  onChange={(event) => onChangeEditableName(event.target.value)}
                  placeholder="Enter your full name"
                />
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={onCancelEditingName}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={onConfirmNameChange}
                    disabled={!hasNameChanged || isUpdatingName}
                    className={!hasNameChanged || isUpdatingName ? 'bg-slate-300 text-slate-600 shadow-none hover:bg-slate-300 active:bg-slate-300' : ''}
                  >
                    {isUpdatingName ? 'Saving...' : 'Confirm'}
                  </Button>
                </div>
              </div>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-500">{userInfo?.email}</p>
          <p className="mt-4 rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700">
            {greeting}, welcome back to Smart Bin.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Account Settings</p>
          <h3 className="mt-1 text-xl font-bold text-slate-900">Personal Preferences</h3>
          <p className="mt-1 text-sm text-slate-600">Select a setting to configure your account. More features are being prepared.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {[
            {
              title: 'Personal Information',
              description: 'Manage your display name, avatar, and account identity settings.',
              icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                </svg>
              ),
            },
            {
              title: 'Notification Settings',
              description: 'Manage alert channels and notification frequency.',
              icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9a6 6 0 10-12 0v.05c0 .238 0 .476.001.714A8.967 8.967 0 013.69 15.77a23.848 23.848 0 005.454 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                </svg>
              ),
            },
            {
              title: 'Security & Privacy',
              description: 'Control login security and account protection options.',
              icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l7.5 4.5v4.8c0 5.2-3.4 8.8-7.5 10.2C7.9 21.1 4.5 17.5 4.5 12.3V7.5L12 3z" />
                </svg>
              ),
            },
            {
              title: 'Language & Region',
              description: 'Choose language, timezone, and localization format.',
              icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9 9 0 100-18 9 9 0 000 18z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.6 9h16.8M3.6 15h16.8M12 3a15.3 15.3 0 010 18M12 3a15.3 15.3 0 000 18" />
                </svg>
              ),
            },
          ].map((setting) => (
            <button
              key={setting.title}
              type="button"
              onClick={onFeatureComingSoon}
              className="rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-slate-300 hover:bg-slate-50"
            >
              <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                {setting.icon}
              </div>
              <p className="text-sm font-semibold text-slate-900">{setting.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">{setting.description}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

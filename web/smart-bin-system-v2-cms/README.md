# Smart Bin CMS (Admin)

Next.js CMS project for Smart Bin system administrators.

## Purpose

This project is an admin web app to configure and operate:

- Users
- Devices
- Device groups
- Notifications

It is mapped from the current user-facing app smart-bin-system-v2-fe.

## Mapping from User App to CMS

1. Dashboard device tab (/dashboard) -> CMS manages full device inventory.
2. Activity/notifications (/dashboard activity) -> CMS triages and marks alerts read.
3. Auth and profile (/auth/*, /users/me) -> CMS controls account state and admin session.

## Tech

- Next.js App Router
- TypeScript
- Tailwind CSS v4
- Shared API client pattern with token refresh

## Environment

Create .env.local:

```bash
NEXT_PUBLIC_API_URL=http://localhost:9999/api/v1
```

## Run

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

## Main Routes

- /auth/login
- /dashboard
- /users
- /devices
- /device-groups
- /notifications
- /settings

## Access Control

- `super_admin` sees dashboard, users, devices, firmwares, firmware mappings, notifications, and settings.
- `admin` sees dashboard, users, device groups, devices, notifications, and settings.

## Note

Some admin endpoints may not exist yet on backend. The CMS structure is ready and follows the same domain model used in smart-bin-system-v2-fe.

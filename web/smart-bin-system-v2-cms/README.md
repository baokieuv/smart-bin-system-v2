# Smart Bin CMS (Admin)

Next.js CMS project for Smart Bin system administrators.

## Purpose

This project is an admin web app to configure and operate:

- Categories
- Products
- Orders
- Users
- Devices
- Notifications

It is mapped from the current user-facing app smart-bin-system-v2-fe.

## Mapping from User App to CMS

1. Public shop browsing (/shop, /shop/products/[id]) -> CMS manages product and category source data.
2. Cart and checkout (/shop/cart) -> CMS monitors and updates order lifecycle.
3. Order detail (/shop/orders/[orderId]) -> CMS updates status/payment/shipping flows.
4. Dashboard device tab (/dashboard) -> CMS manages full device inventory.
5. Activity/notifications (/dashboard activity) -> CMS triages and marks alerts read.
6. Auth and profile (/auth/*, /users/me) -> CMS controls account state and admin session.

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
- /categories
- /products
- /orders
- /users
- /devices
- /notifications

## Note

Some admin endpoints may not exist yet on backend. The CMS structure is ready and follows the same domain model used in smart-bin-system-v2-fe.

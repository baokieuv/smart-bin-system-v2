# ==========================================
# STAGE 1: Cài đặt Dependencies
# ==========================================
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy file quản lý package để tận dụng Docker cache
COPY package.json package-lock.json ./
RUN npm ci

# ==========================================
# STAGE 2: Build project
# ==========================================
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Đã sửa cú pháp ENV có dấu "="
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ==========================================
# STAGE 3: Image Production (Siêu nhẹ)
# ==========================================
FROM node:20-alpine AS runner
WORKDIR /app

# Đã sửa cú pháp ENV có dấu "="
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Bỏ quyền root, chạy bằng user node (Bảo mật)
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Set thư mục public (chứa ảnh, favicon...)
COPY --from=builder /app/public ./public

# Phân quyền cho thư mục cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Tự động copy các file từ thư mục standalone
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

# Đã sửa cú pháp ENV có dấu "="
ENV PORT=3000

# Chạy file server.js đã được tối ưu trong thư mục standalone
CMD ["node", "server.js"]
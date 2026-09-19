# WCU TRADE API — build from monorepo root context.
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl

# ---- deps ----
FROM base AS deps
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
# Only install what the API image needs (api + shared + root) — skips the heavy web deps.
RUN npm install --include-workspace-root --workspace @wcu/api --workspace @wcu/shared

# ---- build ----
FROM deps AS build
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
RUN npm run build --workspace @wcu/shared
WORKDIR /app/apps/api
RUN npx prisma generate && npm run build

# ---- runtime ----
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/apps/api ./apps/api
WORKDIR /app/apps/api
EXPOSE 4000
CMD ["node", "dist/main.js"]

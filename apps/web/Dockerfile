# WCU TRADE Web — build with Vite, serve via nginx (proxies /api and /socket.io to api).
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm install --workspaces --include-workspace-root
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
RUN npm run build --workspace @wcu/shared && npm run build --workspace @wcu/web

FROM nginx:alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80

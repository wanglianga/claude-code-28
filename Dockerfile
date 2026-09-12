# ---------- 阶段1：构建前端 ----------
FROM node:20-alpine AS webbuild
WORKDIR /build/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

# ---------- 阶段2：构建后端 ----------
FROM node:20-alpine AS serverbuild
WORKDIR /build/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY server/ ./
RUN npm run build && npm prune --omit=dev

# ---------- 阶段3：运行时（非 root） ----------
FROM node:20-alpine
ENV NODE_ENV=production \
    PORT=3000 \
    PUBLIC_DIR=/app/public \
    UPLOAD_DIR=/app/data/uploads
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app \
    && mkdir -p /app/data/uploads && chown -R app:app /app
COPY --from=serverbuild --chown=app:app /build/server/node_modules ./node_modules
COPY --from=serverbuild --chown=app:app /build/server/dist ./dist
COPY --from=serverbuild --chown=app:app /build/server/package.json ./package.json
COPY --from=webbuild --chown=app:app /build/web/dist ./public
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null 2>&1 || exit 1
CMD ["node", "dist/index.js"]

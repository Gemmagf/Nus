# ============================================================
# Dockerfile — Ernest API (Fastify)
# Massiu Soft SL
#
# Build:   docker build -t ernest-api ./backend/api
# Run:     docker run -p 3001:3001 --env-file .env ernest-api
# ============================================================

# ── Etapa 1: deps de producció ────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# ── Etapa 2: imatge final ─────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# Usuari no-root per seguretat
RUN addgroup --system --gid 1001 ernest && \
    adduser  --system --uid 1001 ernest
USER ernest

# Copiar deps i codi
COPY --chown=ernest:ernest --from=deps /app/node_modules ./node_modules
COPY --chown=ernest:ernest src/ ./src/
COPY --chown=ernest:ernest package.json ./

# Variables d'entorn per defecte (sobreescriu amb --env-file o Railway)
ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0

EXPOSE 3001

# Health check: Railway ho detecta automàticament
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "src/server.js"]

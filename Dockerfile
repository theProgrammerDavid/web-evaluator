# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:22-slim AS builder

# Skip downloading Chromium — not needed at build time
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# Prune dev dependencies
ENV CI=true
RUN pnpm prune --prod

# ── Stage 2: Production ───────────────────────────────────────────────────────
# Puppeteer base image has Google Chrome pre-installed and runs as non-root pptruser
FROM ghcr.io/puppeteer/puppeteer:24.39.1

WORKDIR /app

# Copy built output and production node_modules from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/public ./public

# Writable directories for screenshots and ratings
RUN mkdir -p screenshots screenshot_ratings \
    && chown -R pptruser:pptruser screenshots screenshot_ratings

EXPOSE 3000

CMD ["node", "dist/main.js"]

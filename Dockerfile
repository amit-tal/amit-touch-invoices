# Multi-stage production Dockerfile for AMIT TOUCH Studio Management System
FROM node:24-bookworm-slim AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy dependencies definitions
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy application source code
COPY . .

# Build frontend production bundle
RUN pnpm run build

# ==============================================================================
# Production Runner Stage with Linux Chromium & Hebrew Typography
# ==============================================================================
FROM node:24-bookworm-slim AS runner

WORKDIR /app

# Install Chromium and Hebrew fonts for headless PDF generation
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-noto-core \
    fonts-noto-extra \
    fonts-freefont-ttf \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Set Chromium environment path for pdfGenerator.ts
ENV CHROME_BIN=/usr/bin/chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=192"
ENV PORT=3000
ENV HOST=0.0.0.0
ENV OWNER_EMAIL="amit2001tal@gmail.com"
ENV OWNER_PASSWORD="AmitTouch2026!"
ENV SETUP_TOKEN="amit-touch-2026"
ENV SESSION_SECRET="amit-touch-production-secure-session-salt-2026"
ENV SIGNING_KEY_PASSPHRASE="AmitTouch_LocalTestKey_2026_Secure!"
ENV ELECTRONIC_RECEIPTS_ENABLED="true"
ENV AUTO_BCC_EMAIL="amit2001tal@gmail.com"

# Install pnpm in production runner
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files and install only production dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

# Copy built frontend assets and server codebase
COPY --from=builder /app/dist ./dist
COPY server ./server
COPY src ./src
COPY public ./public
COPY signiture.png ./signiture.png
COPY .oxlintrc.json ./

# Create persistent storage directories with safe permissions
RUN mkdir -p /app/data /app/protected_backups /app/scratch && \
    chown -R node:node /app

USER node

EXPOSE 3000

# Health check verifies API responsiveness
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/auth/status').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1));"

CMD ["node", "server/server.ts"]

FROM node:26-alpine AS base

# Install essential runtime system dependencies
RUN apk add --no-cache libc6-compat openssl libcrypto3 libssl3

WORKDIR /app

# ---- Dependencies Stage ----
FROM base AS deps

# Install build dependencies for native modules if needed
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
# Scripts needed for postinstall patching
COPY scripts/patch-vercel-og.mjs scripts/patch-lodash-subpaths.mjs ./scripts/

# Install all dependencies (including dev) for building
RUN npm ci

# ---- Build Stage ----
FROM deps AS build

ARG APP_COMMIT_SHA=""
ARG APP_BUILD_TIME=""
ARG VITE_APP_COMMIT_SHA=""
ARG VITE_APP_BUILD_TIME=""

ENV VITE_APP_COMMIT_SHA=${VITE_APP_COMMIT_SHA}
ENV VITE_APP_BUILD_TIME=${VITE_APP_BUILD_TIME}

COPY . .
# .dockerignore handles excluding public/uploads and other heavy dev files
RUN npm run prisma:generate && \
    npm run build

# ---- Production Dependencies Stage ----
FROM base AS prod-deps

COPY package.json package-lock.json ./
# Scripts needed for postinstall patching
COPY scripts/patch-vercel-og.mjs scripts/patch-lodash-subpaths.mjs ./scripts/

RUN npm ci --omit=dev --omit=peer --legacy-peer-deps && \
    npm cache clean --force

# ---- Runtime Stage ----
FROM base AS runtime

ARG APP_COMMIT_SHA=""
ARG APP_BUILD_TIME=""
ARG VITE_APP_COMMIT_SHA=""
ARG VITE_APP_BUILD_TIME=""

ENV NODE_ENV=production
ENV PORT=8080
ENV APP_COMMIT_SHA=${APP_COMMIT_SHA}
ENV APP_BUILD_TIME=${APP_BUILD_TIME}
ENV VITE_APP_COMMIT_SHA=${VITE_APP_COMMIT_SHA}
ENV VITE_APP_BUILD_TIME=${VITE_APP_BUILD_TIME}

# Copy production dependencies and generated prisma client
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma

# Copy application code and built assets
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-astro ./dist-astro

# Create necessary directories and set permissions
RUN test ! -e /app/node_modules/next && \
    test ! -e /app/node_modules/@next && \
    mkdir -p /app/public/uploads && \
    chown -R node:node /app/public/uploads

USER node

EXPOSE 8080

CMD ["sh", "-c", "npm run prisma:migrate:deploy && node server/index.js"]

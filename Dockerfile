# MonteCarloSuite — unified production image (API + React static + C++ engine + Node-API Addon)
# Render-compatible: respects PORT env, single web service.

# ----------------------------
# Stage 1: C++ engine & Node-API Addon
# ----------------------------
FROM node:22-bookworm AS cpp-builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    cmake \
    g++ \
    make \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --ignore-scripts

COPY server/cpp/ ./cpp/
COPY server/build_addon.sh ./
RUN chmod +x ./cpp/build.sh ./build_addon.sh && ./cpp/build.sh && ./build_addon.sh

# ----------------------------
# Stage 2: React client
# ----------------------------
FROM node:22-bookworm AS client-builder

WORKDIR /app/client

COPY client/package.json client/package-lock.json ./
RUN npm ci

COPY client/ ./

# Empty = same-origin API when Express serves the built client
ARG REACT_APP_API_URL=
ENV REACT_APP_API_URL=$REACT_APP_API_URL

RUN npm run build

# ----------------------------
# Stage 3: Production Node runtime
# ----------------------------
FROM node:22-bookworm-slim AS production

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 1001 nodeapp \
    && useradd --system --uid 1001 --gid nodeapp nodeapp

COPY server/package.json server/package-lock.json ./
# Skip postinstall C++ build — binaries are copied from cpp-builder
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY server/ ./

COPY --from=cpp-builder /app/server/cpp/monte_carlo ./cpp/monte_carlo
COPY --from=cpp-builder /app/server/build/Release/monte_carlo_addon.node ./build/Release/monte_carlo_addon.node
COPY --from=client-builder /app/client/build ./client/build

RUN chmod +x ./cpp/monte_carlo && chown -R nodeapp:nodeapp /app

ENV NODE_ENV=production
ENV CLIENT_BUILD_PATH=./client/build
ENV PORT=5001

EXPOSE 5001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 5001) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

USER nodeapp

CMD ["node", "server.js"]

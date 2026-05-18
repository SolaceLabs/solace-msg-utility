# syntax=docker/dockerfile:1.6
#
# Single-binary HTTPS gateway for the Solace Message Utility PWA.
#
# Final image is `FROM scratch` — only the static Go binary and the PWA bundle.
# No shell, no libc, no /etc/passwd. The gateway listens on :9443 (an
# unprivileged port) and runs as a non-root UID, so it needs no special Linux
# capability to bind. It serves the PWA from APP_DIR and reverse-proxies
# SEMP / SMF traffic to user-configured brokers.
#
# Mounts:
#   /tls         — TLS material (tls.crt, tls.key, trust/*.crt, trust/*.pem).
#                  If tls.crt / tls.key are missing, the gateway generates a
#                  self-signed pair on startup (writable mount required for that).
#   /pwa         — PWA bundle (index.html plus any sibling assets). Defaults to
#                  /SolaceMsgUtility inside the image; override with APP_DIR.
#
# Environment (all optional):
#   HOSTED                    "true" enables the /hosted probe endpoint.
#   APP_DIR                   /SolaceMsgUtility
#   SSL_CERT_FILE             /tls/tls.crt
#   SSL_KEY_FILE              /tls/tls.key
#   SSL_TRUST_DIR             /tls/trust
#   SSL_INSECURE_SKIP_VERIFY  "true" disables upstream cert validation.
#   LOG_LEVEL                 debug|info|warn|error  (default warn)

# ---- Stage 1: build the static Go gateway ------------------------------------
FROM golang:1.26.3-alpine AS gateway-builder
WORKDIR /src
COPY go-web-proxy/go.mod ./
COPY go-web-proxy/*.go ./
RUN CGO_ENABLED=0 GOOS=linux go build \
        -trimpath -ldflags="-s -w" \
        -o /gateway .

# Stage the /tls layout in the builder so we can ship it pre-owned by the
# non-root runtime UID. Scratch has no shell, so this is the only way to bake
# an empty, correctly-permissioned directory into the final image.
RUN mkdir -p /staging/tls/trust \
 && chown -R 65532:65532 /staging/tls \
 && chmod 0755 /staging/tls /staging/tls/trust

# ---- Stage 2: build the PWA bundle ------------------------------------------
# Builds dist/{index,mock,min}.html from source so the runtime image doesn't
# depend on whatever happens to be in the host's dist/ at `docker build` time.
FROM node:22-alpine AS pwa-builder
WORKDIR /pwa
# Copy lockfile + manifest first so `npm ci` layer caches when source changes.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json vite.config.ts ./
COPY scripts/ ./scripts/
COPY src/ ./src/
RUN npm run build

# ---- Stage 3: scratch runtime ------------------------------------------------
FROM scratch
# Numeric --chown so everything is owned by the non-root UID we run as.
# Scratch has no /etc/passwd, so we must use numeric IDs everywhere.
COPY --chown=65532:65532 --from=gateway-builder /gateway        /gateway
COPY --chown=65532:65532 --from=gateway-builder /staging/tls    /tls
COPY --chown=65532:65532 --from=pwa-builder     /pwa/dist/      /SolaceMsgUtility/

# 65532 is the conventional "nonroot" UID used by distroless. /tls is baked
# into the image owned by this UID so self-signed cert generation works
# out of the box; mounting an external volume at /tls preserves that ownership
# only if the host directory is also owned by 65532 (named Docker volumes
# inherit the image's ownership; bind mounts do NOT).
USER 65532:65532

EXPOSE 9443
ENTRYPOINT ["/gateway"]

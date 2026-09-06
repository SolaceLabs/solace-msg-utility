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
#   /pwa         — PWA bundle (index.html, solAdmin.html on managed images, plus
#                  any sibling assets such as solclient.js). Defaults to
#                  /SolaceMsgUtility inside the image; override with APP_DIR.
#   /managed     — Writable RBAC store (users.yaml, connections.yaml, site.seed)
#                  for MANAGED=true. Baked empty + owned by UID 65532 so a named
#                  volume there inherits write access; unused when MANAGED is off.
#
# Environment (all optional):
#   HOSTED                    "true" enables the /hosted probe endpoint.
#   MANAGED                   "true" loads the RBAC store and serves /managed/*.
#   CONN_MODES                direct|managed|both → which connection tabs the app
#                             offers. Managed requires HOSTED + MANAGED + the
#                             managed build tag, or the gateway refuses to start.
#   DEFAULT_CONN              direct|managed → which tab opens first under "both".
#   APP_DIR                   /SolaceMsgUtility
#   SSL_CERT_FILE             /tls/tls.crt
#   SSL_KEY_FILE              /tls/tls.key
#   SSL_TRUST_DIR             /tls/trust
#   SSL_INSECURE_SKIP_VERIFY  "true" disables upstream cert validation.
#   LOG_LEVEL                 debug|info|warn|error  (default warn)
#
# Build args (select which image variant to build):
#   MANAGED     Baked default for the MANAGED env var (default empty; "true" for
#               the managed image).
#   HOSTED      Baked default for the HOSTED env var (default empty; "true" for
#               the managed image).
#   CONN_MODES  Baked default for the CONN_MODES env var (default empty → "direct";
#               the managed image passes "managed").
#   GO_TAGS     Go build tags for the gateway (default empty → stdlib-only hosted
#               binary; the managed image passes "managed" to compile in the RBAC
#               store + /managed/* handler and the yaml dependency).
#   WITH_ADMIN  Non-empty ships solAdmin.html (the administration app) alongside
#               the main bundle. Managed images only → see stage 2.
#   APP_VERSION The release tag (e.g. v3.6.0), stamped into the gateway binary's
#               `version` var and the PWA's `__APP_VERSION__`. Git is not
#               available inside the build, so the value has to arrive this way;
#               scripts/dev.sh and .github/workflows/tag.yml both pass it. The
#               default is a deliberately implausible placeholder so a build that
#               lost it looks wrong rather than merely out of date.

# ---- Stage 1: build the static Go gateway ------------------------------------
FROM golang:1.27.0-alpine AS gateway-builder
WORKDIR /src
# go.sum is needed for the managed build (it pulls gopkg.in/yaml.v3); it is
# harmless for the default stdlib-only hosted build, which imports nothing
# third-party. GO_TAGS selects the variant: "" → stdlib-only hosted binary,
# "managed" → compile in the RBAC store + /managed/* handler + yaml.
COPY go-web-proxy/go.mod go-web-proxy/go.sum ./
COPY go-web-proxy/*.go ./
ARG GO_TAGS=""
ARG APP_VERSION="0.0.0-dev"
RUN CGO_ENABLED=0 GOOS=linux go build \
        -trimpath -ldflags="-s -w -X main.version=$APP_VERSION" \
        -tags "$GO_TAGS" \
        -o /gateway .

# Stage the /tls and /managed layouts in the builder so we can ship them
# pre-owned by the non-root runtime UID. Scratch has no shell, so this is the
# only way to bake an empty, correctly-permissioned directory into the final
# image. /managed is the writable RBAC store (users.yaml, site.seed) the gateway
# bootstraps on first run when MANAGED=true — a managed store-load failure is
# fatal, so the dir must be writable by UID 65532. A named volume mounted there
# inherits this ownership; with no volume the store lives in the container's
# writable layer (ephemeral). Unused by the standard image (MANAGED off).
RUN mkdir -p /staging/tls/trust /staging/managed \
 && chown -R 65532:65532 /staging/tls /staging/managed \
 && chmod 0755 /staging/tls /staging/tls/trust /staging/managed

# ---- Stage 2: build the PWA bundle ------------------------------------------
# Builds dist/{index,mock,min}.html from source so the runtime image doesn't
# depend on whatever happens to be in the host's dist/ at `docker build` time.
FROM node:26.8.1-alpine AS pwa-builder
WORKDIR /pwa
# Copy lockfile + manifest first so `npm ci` layer caches when source changes.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json vite.config.ts ./
COPY scripts/ ./scripts/
COPY src/ ./src/
# Declared after the cacheable layers: a version bump alone must not invalidate
# `npm ci`. vite.config.ts reads APP_VERSION into __APP_VERSION__.
ARG APP_VERSION="0.0.0-dev"
RUN APP_VERSION="$APP_VERSION" npm run build

# Stage exactly what this image should serve, rather than copying all of dist/.
# The build emits every variant, and an image has no business shipping bundles it
# does not serve: mock.html is a demo build with canned services, and
# solAdmin.html would be reachable as a plain file at /solAdmin.html, side-
# stepping the hosted+managed check the gateway applies to the /solAdmin route.
# Declared after `npm run build` so the expensive build layer stays cached and
# shared across both image variants.
#
# Both images serve the SAME index.html: which connection modes it offers is a
# runtime decision from CONN_MODES via /hosted, not a per-image bundle.
ARG WITH_ADMIN=""
RUN mkdir -p /staging/app \
 && cp -f /pwa/dist/index.html /staging/app/index.html \
 && if [ -n "$WITH_ADMIN" ]; then cp -f /pwa/dist/solAdmin.html /staging/app/solAdmin.html; fi

# ---- Stage 3: scratch runtime ------------------------------------------------
FROM scratch
# Baked ENV defaults. Empty for the standard image (a no-op — os.Getenv returns
# "" either way), set to "true" for the managed image so it runs correctly out
# of the box. Operators can still override both with `docker run -e` at runtime.
ARG MANAGED=""
ARG HOSTED=""
ARG CONN_MODES=""
# Numeric --chown so everything is owned by the non-root UID we run as.
# Scratch has no /etc/passwd, so we must use numeric IDs everywhere.
COPY --chown=65532:65532 --from=gateway-builder /gateway         /gateway
COPY --chown=65532:65532 --from=gateway-builder /staging/tls     /tls
COPY --chown=65532:65532 --from=gateway-builder /staging/managed /managed
COPY --chown=65532:65532 --from=pwa-builder     /staging/app/    /SolaceMsgUtility/

ENV MANAGED=${MANAGED} \
    HOSTED=${HOSTED} \
    CONN_MODES=${CONN_MODES}

# 65532 is the conventional "nonroot" UID used by distroless. /tls is baked
# into the image owned by this UID so self-signed cert generation works
# out of the box; mounting an external volume at /tls preserves that ownership
# only if the host directory is also owned by 65532 (named Docker volumes
# inherit the image's ownership; bind mounts do NOT).
USER 65532:65532

EXPOSE 9443
ENTRYPOINT ["/gateway"]

# syntax=docker/dockerfile:1.6
#
# Single-binary HTTPS gateway for the Solace Message Utility PWA. One image
# runs every container mode (docs/deployment.md):
#   Gateway mode (the default)  serves the app and relays its broker
#                               connections; users type their broker's details.
#   Provisioned mode (opt-in,   adds sign-in and the admin console; users get
#   CONN_MODES=provisioned)     only the brokers an administrator granted.
#   Files only (opt-in,         serves the app; browsers connect to brokers
#   HOSTED=false)               themselves, as with the Standalone HTML files.
#
# Final image is `FROM scratch` -- only the static Go binary and the PWA
# bundles. No shell, no libc, no /etc/passwd. The gateway listens on :9443 (an
# unprivileged port) and runs as a non-root UID, so it needs no special Linux
# capability to bind.
#
# Mounts:
#   /tls         -- TLS material (tls.crt, tls.key, trust/*.crt, trust/*.pem).
#                  If tls.crt / tls.key are missing, the gateway generates a
#                  self-signed pair on startup (writable mount required for that).
#   /data        -- Writable: config.yaml in every mode, plus in Provisioned mode
#                  users.yaml and connections.yaml (both encrypted with
#                  store.key) and store.key. Baked empty + owned by UID 65532 so
#                  a named volume there inherits write access. Without a volume
#                  it lives in the container's writable layer and config.yaml is
#                  re-seeded from the environment whenever the container is
#                  recreated.
#   /SolaceMsgUtility -- the app (APP_DIR): index.html (the Direct bundle),
#                  provisioned.html (the bundle with the sign-in, served at / in
#                  Provisioned mode), solAdmin.html (the admin console), and
#                  solclient.js, jszip.min.js and licenses/.
#
# Environment (all optional). Except CONFIG_FILE and STORE_KEY_FILE, these only
# SEED config.yaml on the first start, when the file does not exist; afterwards
# the file is authoritative and a differing variable is logged, not applied.
# The client access list (access.allow, access.trustedProxies) has no variable
# and lives only in the file. See docs/deployment.md.
#   CONFIG_FILE               /data/config.yaml (environment-only, never in
#                             the file). Startup fails if it cannot be written.
#   HOSTED                    true (default) | false. false serves the files
#                             only; Provisioned mode needs true.
#   CONN_MODES                direct (default, Gateway mode) | provisioned |
#                             both. Anything but direct turns Provisioned mode
#                             on: sign-in, the stores and /solAdmin.
#   DEFAULT_CONN              direct|provisioned: which tab opens first under
#                             "both".
#   APP_DIR                   /SolaceMsgUtility
#   SSL_CERT_FILE             /tls/tls.crt
#   SSL_KEY_FILE              /tls/tls.key
#   SSL_TRUST_DIR             /tls/trust
#   SSL_INSECURE_SKIP_VERIFY  "true" disables upstream cert validation.
#   LOG_LEVEL                 debug|info|warn|error  (default warn; anything
#                             else fails startup)
#   STORE_KEY_FILE            /data/store.key (Provisioned mode; environment-
#                             only; encrypts users.yaml and connections.yaml,
#                             made on a fresh volume only -- back it up)
#
# Build args:
#   APP_VERSION The release tag (e.g. v3.6.0), stamped into the gateway binary's
#               `version` var and the PWA's `__APP_VERSION__`. Git is not
#               available inside the build, so the value has to arrive this way;
#               scripts/dev.sh and .github/workflows/tag.yml both pass it. The
#               default is a deliberately implausible placeholder so a build that
#               lost it looks wrong rather than merely out of date.

# ---- Stage 1: build the static Go gateway ------------------------------------
FROM golang:1.27.3-alpine AS gateway-builder
WORKDIR /src
# pages/ holds the sign-in page the binary embeds (go:embed).
COPY go-web-proxy/go.mod go-web-proxy/go.sum ./
COPY go-web-proxy/*.go ./
COPY go-web-proxy/pages/ ./pages/
ARG APP_VERSION="0.0.0-dev"
RUN CGO_ENABLED=0 GOOS=linux go build \
        -trimpath -ldflags="-s -w -X main.version=$APP_VERSION" \
        -o /gateway .

# Stage the /tls and /data layouts in the builder so we can ship them
# pre-owned by the non-root runtime UID. Scratch has no shell, so this is the
# only way to bake an empty, correctly-permissioned directory into the final
# image. /data is the gateway's writable store: config.yaml in every mode
# (seeded from env on the first start; an unwritable dir is fatal) plus the
# stores and store.key in Provisioned mode (a store-load failure is fatal too).
# So the dir must be writable by UID 65532. A named volume mounted there
# inherits this ownership; with no volume the store lives in the container's
# writable layer (ephemeral: config.yaml is re-seeded on every recreate).
RUN mkdir -p /staging/tls/trust /staging/data \
 && chown -R 65532:65532 /staging/tls /staging/data \
 && chmod 0755 /staging/tls /staging/tls/trust /staging/data

# ---- Stage 2: build the PWA bundle ------------------------------------------
# Builds every dist/*.html variant from source so the runtime image doesn't
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

# Stage exactly what the image serves, rather than copying all of dist/. The
# build emits every variant, and the image has no business shipping bundles it
# does not serve: demo.html and provisioned-demo.html are the demo builds (the
# in-browser broker, and for the Provisioned demo a fake gateway too).
#
# The gateway picks the bundle at /: index.html (the Release bundle, Direct
# only) in Gateway mode, provisioned.html (the only bundle that carries the
# sign-in) in Provisioned mode. Which tabs provisioned.html offers is still a
# runtime decision from CONN_MODES via /hosted. solAdmin.html is served only on
# the /solAdmin route, behind the admin gate; a request for either file by name
# gets 404.
#
# The two vendor scripts the shell loads from beside the bundle, from the exact
# versions package.json pins (package-lock.json holds their hashes), with the
# licence files their terms ask to travel with them: every notice the Solace
# SDK ships, and JSZip's licence (taken under MIT). A missing file fails the
# build. The Release HTML files never carry either: nothing in src/ imports
# them. tests/build/vendor-scripts.test.ts checks each path exists in the
# package.
RUN mkdir -p /staging/app/licenses/solclientjs /staging/app/licenses/jszip \
 && cp node_modules/solclientjs/lib-browser/solclient.js node_modules/jszip/dist/jszip.min.js /staging/app/ \
 && cp node_modules/solclientjs/LICENSE.txt node_modules/solclientjs/licenses.txt node_modules/solclientjs/COPYRIGHT.txt /staging/app/licenses/solclientjs/ \
 && cp node_modules/jszip/LICENSE.markdown /staging/app/licenses/jszip/ \
 && cp /pwa/dist/index.html /pwa/dist/provisioned.html /pwa/dist/solAdmin.html /staging/app/

# ---- Stage 3: scratch runtime ------------------------------------------------
FROM scratch
# Numeric --chown so everything is owned by the non-root UID we run as.
# Scratch has no /etc/passwd, so we must use numeric IDs everywhere.
COPY --chown=65532:65532 --from=gateway-builder /gateway      /gateway
COPY --chown=65532:65532 --from=gateway-builder /staging/tls  /tls
COPY --chown=65532:65532 --from=gateway-builder /staging/data /data
COPY --chown=65532:65532 --from=pwa-builder     /staging/app/ /SolaceMsgUtility/

# 65532 is the conventional "nonroot" UID used by distroless. /tls is baked
# into the image owned by this UID so self-signed cert generation works
# out of the box; mounting an external volume at /tls preserves that ownership
# only if the host directory is also owned by 65532 (named Docker volumes
# inherit the image's ownership; bind mounts do NOT).
USER 65532:65532

EXPOSE 9443
ENTRYPOINT ["/gateway"]

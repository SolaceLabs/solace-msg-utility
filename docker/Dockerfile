# syntax=docker/dockerfile:1.6@sha256:ac85f380a63b13dfcefa89046420e1781752bab202122f8f50032edf31be0021
#
# Single-binary HTTPS gateway for the Solace Message Utility PWA. One image
# runs every container mode (docs/deployment.md):
#   Gateway mode (the default)  serves the app and relays its broker
#                               connections; users type their broker's details.
#   Provisioned mode (opt-in,   adds sign-in and the admin console; users get
#   SMU_CONN_MODES=provisioned)     only the brokers an administrator granted.
#   Files only (opt-in,         serves the app; browsers connect to brokers
#   SMU_HOSTED=false)               themselves, as with the Standalone HTML files.
#
# Final image is `FROM scratch` -- only the static Go binary, the PWA bundles
# and the standard root CA bundle (Mozilla's list, from the Go build stage's
# Alpine). No shell, no libc, no /etc/passwd. The gateway listens on :9443 (an
# unprivileged port) and runs as a non-root UID, so it needs no special Linux
# capability to bind.
#
# Mounts:
#   /tls         -- TLS material (tls.crt, tls.key, trust/*.crt, trust/*.pem).
#                  If tls.crt / tls.key are missing, the gateway generates a
#                  self-signed pair on startup (writable mount required for that).
#   /data        -- Writable: config.yaml in every mode, plus in Provisioned mode
#                  users.yaml, connections.yaml and backup.yaml (all encrypted
#                  with store.key) and store.key. Baked empty + owned by UID 65532 so
#                  a named volume there inherits write access. Without a volume
#                  it lives in the container's writable layer and config.yaml is
#                  re-seeded from the environment whenever the container is
#                  recreated.
#   /backup      -- Provisioned mode's scheduled backups (the admin console's
#                  Backup & Restore), at a fixed path. Baked empty, owned by
#                  UID 65532 and private (0700); mount a host directory here
#                  (owned by 65532) to keep the backups outside the container.
#                  Each file is encrypted with the passphrase the
#                  administrator set, not with store.key.
#   /SolaceMsgUtility -- the app, at a fixed path: index.html (the Direct
#                  bundle), provisioned.html (the bundle with the sign-in,
#                  served at / in Provisioned mode), solAdmin.html (the admin
#                  console), and solclient.js, jszip.min.js and licenses/ (the
#                  notices of the JavaScript libraries and of the gateway's Go
#                  code).
#
# Environment (all optional). These only SEED config.yaml (always
# /data/config.yaml; startup fails if it cannot be written) on the first start,
# when the file does not exist; afterwards the file is authoritative and a
# differing variable is logged, not applied. The client access list
# (access.allow, access.trustedProxies) has no variable: an administrator sets
# it on Gateway Settings, in Provisioned mode. See docs/deployment.md.
#   SMU_HOSTED                true (default) | false. false serves the files
#                             only; Provisioned mode needs true.
#   SMU_CONN_MODES            direct (default, Gateway mode) | provisioned |
#                             both. Anything but direct turns Provisioned mode
#                             on: sign-in, the stores and /solAdmin.
#   SMU_DEFAULT_CONN          direct|provisioned: which tab opens first under
#                             "both".
#   SMU_SSL_CERTFILE          /tls/tls.crt
#   SMU_SSL_CERTKEYFILE       /tls/tls.key
#   SMU_SSL_TRUSTDIR          /tls/trust
#   SMU_SSL_SKIP_CERT_VERIFY  "true" disables upstream cert validation.
#   SMU_ADMIN_PASSWORD        Provisioned mode: the bootstrap admin password,
#                             read only while users.yaml does not exist yet.
#   SMU_ADMIN_PASSWORD_FILE   The same, as the path of a file (a Docker secret).
#   LOG_LEVEL                 debug|info|warn|error  (default warn; anything
#                             else fails startup)
#   SMU_SHOW_AUDIT            Provisioned mode: "true" also copies each audit
#                             line to stdout (default false; seeds audit.stdout
#                             in config.yaml). The audit trail itself is always
#                             /data/audit.log, never filtered by LOG_LEVEL.
# The users store, connections store and store key always live at
# /data/users.yaml, /data/connections.yaml and /data/store.key (the key is made
# on a fresh volume only -- back it up); move them with Backup & Restore. The
# gateway refuses to start while a pre-rename variable (SSL_CERT_FILE,
# SSL_KEY_FILE, SSL_TRUST_DIR, SSL_INSECURE_SKIP_VERIFY, HOSTED, CONN_MODES,
# DEFAULT_CONN, ADMIN_PASSWORD, ADMIN_PASSWORD_FILE) is set, and warns that
# USERS_FILE, CONNECTIONS_FILE and STORE_KEY_FILE are ignored.
#
# Build args:
#   APP_VERSION The release tag (e.g. v4.0.0), stamped into the gateway binary's
#               `version` var and the PWA's `__APP_VERSION__`. Git is not
#               available inside the build, so the value has to arrive this way;
#               scripts/dev.sh and .github/workflows/tag.yml both pass it. The
#               default is a deliberately implausible placeholder so a build that
#               lost it looks wrong rather than merely out of date.

# ---- Stage 1: build the static Go gateway ------------------------------------
# Base images and the syntax frontend are pinned tag@digest (the multi-arch
# index digest), so a re-pushed tag cannot change the build; Dependabot's
# docker entry moves the digest.
FROM golang:1.27.4-alpine@sha256:70bd7ddea8b6cbe5d6943cde279d6b67feb10cc924fb9100d1d8757c1575b280 AS gateway-builder
WORKDIR /src
# pages/ holds the sign-in page the binary embeds (go:embed).
COPY go-web-proxy/go.mod go-web-proxy/go.sum ./
# The modules in a layer of their own, as npm ci is below: a source change
# does not fetch them again.
RUN go mod download
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
RUN mkdir -p /staging/tls/trust /staging/data /staging/backup \
 && chown -R 65532:65532 /staging/tls /staging/data /staging/backup \
 && chmod 0755 /staging/tls /staging/tls/trust /staging/data \
 && chmod 0700 /staging/backup

# The licence notices of the Go code the gateway binary contains: Go's own
# standard library (BSD-3-Clause), gopkg.in/yaml.v3 (Apache-2.0 and MIT, with its
# NOTICE) and rsc.io/qr (BSD-3-Clause). They are taken from where the toolchain
# has them, after the go build above has downloaded the modules, so no module
# version is written here, and land beside the JavaScript ones under the app's
# licenses/ directory (the final COPY merges them in). A missing file fails the
# build. tests/build/vendor-scripts.test.ts checks that every direct requirement
# in go.mod has its licence copied here.
# The standard root CA bundle's notice (MPL-2.0), from the repository; the
# bundle itself is copied into the final image below.
COPY docker/licenses/ca-certificates/NOTICE /staging/licenses/ca-certificates/NOTICE
RUN mkdir -p /staging/licenses/go /staging/licenses/gopkg.in-yaml.v3 /staging/licenses/rsc.io-qr \
 && cp "$(go env GOROOT)/LICENSE" /staging/licenses/go/ \
 && cp "$(go list -m -f '{{.Dir}}' gopkg.in/yaml.v3)/LICENSE" "$(go list -m -f '{{.Dir}}' gopkg.in/yaml.v3)/NOTICE" /staging/licenses/gopkg.in-yaml.v3/ \
 && cp "$(go list -m -f '{{.Dir}}' rsc.io/qr)/LICENSE" /staging/licenses/rsc.io-qr/ \
 && chmod -R a+rX /staging/licenses

# ---- Stage 2: build the PWA bundle ------------------------------------------
# Builds every dist/*.html variant from source so the runtime image doesn't
# depend on whatever happens to be in the host's dist/ at `docker build` time.
FROM node:26.13.1-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS pwa-builder
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
# The bundles this image ships pass the isolation check on this build, not only
# on the separate one in CI: index.html carries no Provisioned UI, and
# provisioned.html carries it without the demo's fake gateway
# (scripts/check-bundles.mjs).
RUN npm run check:bundles

# Stage exactly what the image serves, rather than copying all of dist/. The
# build emits every variant, and the image has no business shipping bundles it
# does not serve: demo.html and provisioned-demo.html are the demo builds (the
# in-browser broker, and for the Provisioned demo a fake gateway too).
#
# The gateway picks the bundle at /: index.html (the Release bundle, Direct
# only) in Gateway mode, provisioned.html (the only bundle that carries the
# sign-in) in Provisioned mode. Which tabs provisioned.html offers is still a
# runtime decision from SMU_CONN_MODES via /hosted. solAdmin.html is served only on
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
COPY --chown=65532:65532 --from=gateway-builder /staging/backup /backup
COPY --chown=65532:65532 --from=pwa-builder     /staging/app/ /SolaceMsgUtility/
COPY --chown=65532:65532 --from=gateway-builder /staging/licenses/ /SolaceMsgUtility/licenses/
# The standard root CAs the gateway trusts while tls.standardRoots is on
# (go-web-proxy/tls.go, standardRootsFile): Alpine's ca-certificates-bundle in
# the pinned Go build stage, so it moves with that stage's digest. Root-owned:
# the gateway only reads it.
COPY --from=gateway-builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt

# 65532 is the conventional "nonroot" UID used by distroless. /tls is baked
# into the image owned by this UID so self-signed cert generation works
# out of the box; mounting an external volume at /tls preserves that ownership
# only if the host directory is also owned by 65532 (named Docker volumes
# inherit the image's ownership; bind mounts do NOT).
USER 65532:65532

EXPOSE 9443
ENTRYPOINT ["/gateway"]

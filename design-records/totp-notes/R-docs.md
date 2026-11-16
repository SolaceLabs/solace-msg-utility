# R-docs notes. Nothing was run.

Edited: README.md, docs/{provisioned-mode,user-guide,architecture,deployment,demo,contributing,test-report}.md, docker/Dockerfile, tests/build/vendor-scripts.test.ts. developer-guide.md needed no change. No headings added or removed (Contents lists unchanged; checked read-only).

T13 in docs: three modes, default optional; no sentence says two-factor can be switched off. provisioned-mode.md "A lost phone" now describes the only supported way back for a lone admin, verified against store.go loadStore (missing users.yaml -> bootstrapUsers creates `admin`, must change password; key present so loadStoreKey is fine; connections/backup untouched) and the import rules (Merge keeps other users, replaces same-named; Replace would drop the helper admin). Owner must check: step 5 claim that Merge with a locked account named `admin` replaces the new `admin` (follows from the doc's Merge definition), and that session loss on restart holds (sessions are in memory, session.go).
Old test-report ledger entry for the first build is left as history (it still names the four modes and TestTwoFactorOff_AnswersNotInUse); the new entry says what changed.
Test names the new test-report entry cites as removed: TestTwoFactorOff_AnswersNotInUse. Other agents' renamed tests are not named.

L1: Dockerfile gateway stage gains one RUN after the /staging layout (go env GOROOT LICENSE; go list -m -f '{{.Dir}}' for yaml.v3 LICENSE+NOTICE and rsc.io/qr LICENSE; mkdir -p, cp in an && chain so a missing file fails; chmod -R a+rX), final stage gains COPY --from=gateway-builder /staging/licenses/ /SolaceMsgUtility/licenses/ (merges with the app's licenses/). Owner must check by building the image: go list -m needs the modules in the cache (they are, after go build in the same stage) and the golang alpine image's GOROOT has LICENSE.
Test: three new tests in vendor-scripts.test.ts parse go.mod direct requirements (not // indirect) and check Dockerfile text.

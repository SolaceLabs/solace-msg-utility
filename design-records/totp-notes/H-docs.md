# H-docs notes (docs only). Nothing was run.

## Files edited
README.md, docs/{provisioned-mode,user-guide,architecture,developer-guide,deployment,demo,contributing,test-report}.md.
New headings (Contents lists updated, checked with a read-only script against the docs-links rules, links resolve):
- provisioned-mode.md: `## Two-factor sign-in` with `### Choosing a mode`, `Setting it up`, `Signing in with a code`, `Recovery codes`, `A lost phone`, `The gateway's clock`, `Backups and two-factor`.
- user-guide.md: `### Two-factor sign-in` (under Provisioned Connections).
- architecture.md: `### Two-factor sign-in` (after The single writer). Gateway routes row now lists /login/code and /login/two-factor.
- developer-guide.md: `### Adding a sign-in step`. demo.md: `### Trying two-factor sign-in`.
- deployment.md and test-report.md, contributing.md, README.md: no new headings.

## Facts the docs now state (keep code in line)
- Labels copied from the real gateway: code page "Two-factor sign-in", "Code", "Continue", "Start again", "The code is not correct."; enrol "Set up two-factor sign-in", "Turn on two-factor sign-in"; setup "Password", "Current code or a recovery code", "The password or the code is not correct."; recovery "Recovery codes"; off "Two-factor sign-in is not in use."
- Admin console labels: column "Two-factor" (On/Off); icon title `Reset two-factor for user "<name>"`; toasts "Two-factor sign-in reset" / "Two-factor sign-in reset. You have been signed out."; settings label "Two-factor sign-in (code from an authenticator app)" with Off / Optional / Administrators must use it / Everyone must use it.
- demo.md says the demo's buttons differ (Verify, Confirm) and that it writes no audit lines. If the fake is aligned to the real copy, edit that bullet.
- contributing.md/test-report.md: e2e is 40 checks (27 numbered, B1-B9, D1-D4), 30 with E2E_BROWSER=0. The old contributing.md text said 32/22 (stale; test-report said 36/26).
- contributing.md says e2e-lib.mjs has a TOTP helper tested against testdata/contract/totp.json and checks 24-27 as in the design; the e2e agent's final code must match (the ids `#two-factor-secret`, `#recovery-codes`).
- test-report.md ledger entry "Two-factor sign-in with TOTP (November 2026)" names tests as shipped by the other agents; Results says the gates have not been run. The owner updates it with real results.
- provisioned-mode.md says the lone-administrator last resort is editing `login.twoFactor: off` in config.yaml on the host and restarting (follows from "off asks nobody").

## Removed or renamed: nothing.

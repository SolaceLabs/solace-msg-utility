# R-contract (T13) -- nothing was run
- seed.json: login.twoFactor optional.
- cases.json: every recorded me/settings body says optional; "each mode is saved" case now saves admins, mandatory, optional and reads each back (the off save was removed); off joins the bad values (422 invalid, field login.twoFactor), the mode stays optional.
- Reason text in the 422 cases is assumed: must be "optional", "admins" or "mandatory". Owner must check it against the Go message (and the fake gateway's) after the Go agent's change.
- e2e.mjs: harness default and every restore (check 27 finally, outer finally) use optional; comments updated. Check 24/25/26 still call setTwoFactorMode(optional) (now a harmless no-op save).
- seed.test.ts: seed expectation optional. contract/routes/error-codes/e2e-lib tests needed no change.
- cases.json parsed with python json.load after editing.

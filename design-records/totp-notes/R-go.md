# R-go notes (T13, real gateway). Nothing was compiled or run.

Changed (go-web-proxy/): totp.go, configfile.go, live.go, main.go, pages.go, and tests totp_test.go, configfile_test.go,
live_test.go, main_test.go, managed_test.go, settings_test.go, backup_test.go, backup_api_test.go, logging_test.go, pages_test.go.

- twoFactorOff gone. Values: optional (default; "" and a missing key), admins, mandatory. need(): admins and mandatory as
  before; anything else (optional, "") asks the enrolled for a code, nobody else.
- checkTwoFactor refuses "off" like any bad value; the message names key, value, the three choices and says it cannot be
  switched off: "change the key in config.yaml, or import the backup without its settings". Same text on a settings save
  (422 invalid, field login.twoFactor) and on a backup import (checkSettings, same field).
- pages.go: twoFactorInUse, its three call sites and the not-in-use page removed. pages/login.html needed no change.
- Backup: readBackup unchanged (twoFactorOrDefault now gives optional; an "off" in a file is passed on and refused at
  import by checkSettings). A preview of such a file still shows; only the import refuses.
- Tests: removed TestTwoFactorOff_AnswersNotInUse, the setTwoFactor helper and ticket2 (both only it used), the off rows of
  need and of the sign-in table. New: off refused in totp/configfile/settings tests; backup_api_test.go
  TestBackupAPI_ImportRefusals (off backup, 422 on login.twoFactor, reason names value and way out) and
  TestBackupAPI_ImportRestoresTheTwoFactorMode (mandatory restored; a backup without the key restores optional).
- Encoded config.yaml line is now `twoFactor: optional` (no quotes; "off" needed them as a YAML boolean).

Owner must check: the new need() rows {"", true,false,""} and {"",false,true,stageCode}; optionalEnv is now the same as
the default env (kept, harmless); the settings test first loop value equals the default (still proves the save).
Other agents: contract seed/cases ("off" -> "optional"), docs (config.yaml header text changed), nothing else needed here.

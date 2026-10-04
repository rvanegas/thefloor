# The seven-day retention promise is not guarded by the privacy test

`/privacy` states three retention periods as numbers, restated in
`server/src/privacy.ts` rather than imported, on purpose — EXPIRATIONS.md §
*Three of them are published promises, and only two are guarded* has why.
`server/__tests__/privacy.test.ts` keeps two of the restatements honest by
computing the day count from `USAGE_RETENTION_MS` and
`TRANSCRIPT_DELETED_RETENTION_MS` and asserting the page contains it.

**The third it asserts as a literal**, `'7 days later'`, which the page also
writes as a literal. So `DELETED_RETENTION_MS` in `core/constants.ts` can be
changed and the published promise goes on saying seven days with a green
suite. The client copy is safe — `ChannelSettingsView` derives its wording from
the constant — so the failure is specifically the app and the policy
disagreeing.

The fix is the same computation the other two have: derive the day count from
`DELETED_RETENTION_MS` and assert that. Found 2026-08-27, still true on
2026-10-03.

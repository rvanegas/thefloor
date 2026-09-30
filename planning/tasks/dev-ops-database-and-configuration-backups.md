# Dev Ops, database and configuration backups

As of 2026-09-30, the box has no backup of anything on it. The server has no
cron job and no timer that copies `thefloor.db`, and this checkout's AWS user
cannot even ask whether Lightsail auto-snapshots are turned on
(`GetAutoSnapshots` is denied), so that is the first thing to find out. The
one copy of the database that exists is the one taken for the migration, in
`~/.config/thefloor/backup-2026-08-13`, which is by now six weeks stale.

The configuration half has the same weak spot. `bin/provision` reads the
`thefloor` unit and the Caddyfile from that same directory on Rodrigo's Mac,
so a rebuild works only while the Mac survives, and the rebuild is meant for
the day something is lost. Checked on 2026-09-30: the live unit is identical
to the backup, and the live Caddyfile differs only by the
`livekit.rvanegas.co` block that `bin/provision-livekit` appends, so today the
two scripts in order would reproduce the box. The fix is to write both files
out inside `bin/provision`, as `bin/provision-livekit` already does its units
(MIGRATION.md § *What survives: `bin/provision`* names this gap).

What a backup has to cover: the database (online, with `sqlite3 .backup`
rather than a file copy, since it is in WAL mode), `server/.env` and the
LiveKit key pair (CREDENTIALS.md says where each lives and where copies are
allowed to go), and somewhere off the box to keep them. Recordings are
already in S3 and are not part of this.

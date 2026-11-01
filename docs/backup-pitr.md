# Backup & PITR Runbook

## PostgreSQL
- Enable WAL archiving: `archive_mode = on`, `archive_command` to S3/local.
- Base backup: `pg_basebackup -D /backup/base -Fp -Xs -P`.
- PITR: restore base backup, place `recovery.signal`, set `restore_command` and `recovery_target_time`.

## SQLite
- File-per-tenant: copy tenant `.sqlite` file (atomic with `.backup` command).
- Platform DB: same file copy approach.

## Verification
- Restore to staging monthly; run smoke tests.
- Confirm audit_log and business data consistency after restore.
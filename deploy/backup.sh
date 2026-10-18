#!/bin/sh
# Invoke with sh deploy/backup.sh [private-backup-directory]. Never removes old backups.
set -eu
umask 077
pilot_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
backup_dir=${1:-"$pilot_dir/backups"}
mkdir -p "$backup_dir"
backup_file="$backup_dir/janus-$(date -u +%Y%m%dT%H%M%SZ)-$$.dump"
trap 'rm -f "$backup_file.partial"' 0
trap 'exit 1' HUP INT TERM
docker compose --env-file "$pilot_dir/.env" -f "$pilot_dir/compose.yml" exec -T postgres \
  pg_dump -U janus -d janus --format=custom --no-owner > "$backup_file.partial"
mv "$backup_file.partial" "$backup_file"
printf 'Saved database backup: %s\n' "$backup_file"

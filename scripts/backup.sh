#!/bin/bash
# PostgreSQL Backup Script
# Aufruf: ./scripts/backup.sh
# Cronjob: 0 2 * * * /pfad/scripts/backup.sh

BACKUP_DIR="./backups"
DATE=$(date +%Y-%m-%d_%H-%M)
CONTAINER="hr-portal-db"
DB_NAME="hr_portal"
DB_USER="hrportal"
RETENTION_DAYS=30

mkdir -p "$BACKUP_DIR"

# Backup erstellen
docker exec $CONTAINER pg_dump -U $DB_USER -d $DB_NAME -F c -f /backups/hr_portal_${DATE}.dump

# Alte Backups loeschen
find "$BACKUP_DIR" -name "*.dump" -mtime +$RETENTION_DAYS -delete

echo "[$(date)] Backup erstellt: hr_portal_${DATE}.dump"

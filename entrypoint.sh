#!/bin/sh
set -e
# =============================================
# CREDO HR-Portal - Docker Entrypoint
# Fuehrt Prisma Migrationen aus, seedet bei Bedarf
# und startet Next.js
# =============================================

echo "CREDO HR-Portal startet..."

# =============================================
# Pflicht-Umgebungsvariablen pruefen
# =============================================
if [ -z "$JWT_SECRET" ] || echo "$JWT_SECRET" | grep -q "dev_secret"; then
  echo "FATAL: JWT_SECRET fehlt oder enthaelt 'dev_secret'. Produktion erfordert ein sicheres Secret!"
  exit 1
fi

if [ -z "$ENCRYPTION_KEY" ] || [ ${#ENCRYPTION_KEY} -lt 64 ]; then
  echo "FATAL: ENCRYPTION_KEY fehlt oder ist zu kurz (min. 64 Hex-Zeichen). Personaldaten koennen nicht verschluesselt werden!"
  echo "Generieren mit: openssl rand -hex 32"
  exit 1
fi

if [ -z "$BEM_ENCRYPTION_KEY" ] || [ ${#BEM_ENCRYPTION_KEY} -lt 64 ]; then
  echo "FATAL: BEM_ENCRYPTION_KEY fehlt oder ist zu kurz (min. 64 Hex-Zeichen). BEM-Gesundheitsdaten koennen nicht verschluesselt werden!"
  echo "Generieren mit: openssl rand -hex 32"
  exit 1
fi

if [ -z "$DATABASE_URL" ]; then
  echo "FATAL: DATABASE_URL ist nicht gesetzt!"
  exit 1
fi

echo "Umgebungsvariablen geprueft: OK"

# =============================================
# Schema-Abgleich — mit Sicherung davor
# =============================================
# --accept-data-loss: Prisma bricht sonst bei jeder neuen Unique-Constraint
# oder Spalten-Aenderung mit Daten-Loss-Warnung ab (Exit != 0) und der
# Container startet nicht. Im Produktionsbetrieb wollen wir Schema-Drift
# automatisch ausrollen; destruktive Aenderungen werden ueber Review/PR
# kontrolliert, nicht ueber das Entrypoint-Script.
#
# Das Flag heisst aber woertlich "nimm Datenverlust in Kauf": Eine in
# schema.prisma umbenannte Spalte wird als "alte loeschen, neue anlegen"
# ausgerollt — die Personaldaten darin sind dann weg, unbeaufsichtigt und ohne
# Rueckfrage. Es gibt keinen Migrationsordner, also auch kein Netz darunter.
# Deshalb: vorher sichern, und wenn das nicht geht, gar nicht erst pushen.

BACKUP_DIR="${DB_BACKUP_DIR:-/backups}"
BACKUP_BEHALTEN="${DB_BACKUP_KEEP:-10}"

# Aendert sich ueberhaupt etwas? `migrate diff` beantwortet das ohne zu
# schreiben: 0 = deckungsgleich, 2 = es gibt einen Unterschied.
# Bei einem echten Fehler (1) sichern wir vorsichtshalber trotzdem.
set +e
npx prisma migrate diff \
  --from-url "$DATABASE_URL" \
  --to-schema-datamodel ./prisma/schema.prisma \
  --exit-code >/dev/null 2>&1
DIFF_STATUS=$?
set -e

if [ "$DIFF_STATUS" -eq 0 ]; then
  echo "Datenbank-Schema ist bereits deckungsgleich — kein Abgleich noetig."
else
  if [ "$DIFF_STATUS" -eq 2 ]; then
    echo "Schema-Unterschied erkannt — Sicherung wird angelegt..."
  else
    echo "Schema-Vergleich nicht moeglich (Status $DIFF_STATUS) — Sicherung vorsichtshalber."
  fi

  if [ ! -d "$BACKUP_DIR" ]; then
    echo "FATAL: Sicherungsverzeichnis $BACKUP_DIR fehlt."
    echo "Der Schema-Abgleich laeuft mit --accept-data-loss und wird ohne"
    echo "Sicherung nicht ausgefuehrt."
    echo "Abhilfe: in docker-compose.yml beim Dienst 'app' einhaengen:"
    echo "    volumes:"
    echo "      - ./backups:/backups"
    echo "Oder DB_BACKUP_DIR auf ein beschreibbares Verzeichnis setzen."
    exit 1
  fi

  # DATABASE_URL ist eine Prisma-URL. `?schema=` ist ein Prisma-Parameter, den
  # libpq nicht kennt — pg_dump bricht damit ab ("invalid URI query parameter").
  # Also den Parameter herausloesen und als -n weiterreichen; alles andere
  # (z.B. sslmode) bleibt unangetastet.
  PG_SCHEMA="$(printf '%s' "$DATABASE_URL" | sed -n 's/.*[?&]schema=\([^&]*\).*/\1/p')"
  [ -z "$PG_SCHEMA" ] && PG_SCHEMA=public
  DUMP_URL="$(printf '%s' "$DATABASE_URL" \
    | sed -E 's/([?&])schema=[^&]*/\1/g' \
    | sed -E 's/\?&+/?/g; s/&&+/\&/g; s/[?&]+$//')"

  BACKUP_DATEI="$BACKUP_DIR/vor-schema-abgleich-$(date +%Y%m%d-%H%M%S).sql"
  if ! pg_dump --schema="$PG_SCHEMA" "$DUMP_URL" > "$BACKUP_DATEI" 2>"$BACKUP_DATEI.log"; then
    echo "FATAL: Sicherung nach $BACKUP_DATEI fehlgeschlagen."
    sed 's/^/    /' "$BACKUP_DATEI.log" 2>/dev/null | head -20
    echo "Der Schema-Abgleich wird NICHT ausgefuehrt — sonst koennten"
    echo "Personaldaten ohne Rueckweg verloren gehen."
    rm -f "$BACKUP_DATEI" "$BACKUP_DATEI.log"
    exit 1
  fi
  rm -f "$BACKUP_DATEI.log"
  echo "Sicherung abgelegt: $BACKUP_DATEI ($(wc -c < "$BACKUP_DATEI") Bytes)"

  # Aeltere Sicherungen aufraeumen, damit das Volume nicht unbegrenzt waechst.
  # Nur die eigenen Dateien, fremde Backups im selben Verzeichnis bleiben.
  ls -1t "$BACKUP_DIR"/vor-schema-abgleich-*.sql 2>/dev/null \
    | tail -n +"$((BACKUP_BEHALTEN + 1))" \
    | while read -r alt; do
        echo "Alte Sicherung entfernt: $alt"
        rm -f "$alt"
      done

  echo "Datenbank-Schema wird synchronisiert..."
  npx prisma db push --skip-generate --accept-data-loss 2>&1
  echo "Datenbank-Schema synchronisiert."
fi

# Seed ausfuehren wenn noch kein Admin-User existiert
echo "Pruefe ob Seed notwendig..."
node prisma/seed-check.js 2>&1 || echo "Seed-Check fehlgeschlagen (nicht kritisch)."

# Kurz warten damit Seed abschliessen kann
sleep 2

echo "Next.js Server startet auf Port $PORT..."
exec node server.js

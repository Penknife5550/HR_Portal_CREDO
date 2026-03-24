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

if [ -z "$DATABASE_URL" ]; then
  echo "FATAL: DATABASE_URL ist nicht gesetzt!"
  exit 1
fi

echo "Umgebungsvariablen geprueft: OK"

echo "Datenbank-Migrationen werden ausgefuehrt..."
prisma migrate deploy 2>&1
echo "Migrationen erfolgreich."

# Seed ausfuehren wenn noch kein Admin-User existiert
echo "Pruefe ob Seed notwendig..."
node prisma/seed-check.js 2>&1 || echo "Seed-Check fehlgeschlagen (nicht kritisch)."

# Kurz warten damit Seed abschliessen kann
sleep 2

echo "Next.js Server startet auf Port $PORT..."
exec node server.js

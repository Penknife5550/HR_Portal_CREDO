#!/bin/sh
set -e
# =============================================
# CREDO HR-Portal - Docker Entrypoint
# Fuehrt Prisma Migrationen aus, seedet bei Bedarf
# und startet Next.js
# =============================================

echo "CREDO HR-Portal startet..."

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

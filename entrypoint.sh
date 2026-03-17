#!/bin/sh
set -e
# =============================================
# CREDO HR-Portal - Docker Entrypoint
# Fuehrt Prisma Migrationen aus und startet Next.js
# =============================================

echo "CREDO HR-Portal startet..."

echo "Datenbank-Migrationen werden ausgefuehrt..."
npx prisma migrate deploy 2>&1
echo "Migrationen erfolgreich."

echo "Next.js Server startet auf Port $PORT..."
exec node server.js

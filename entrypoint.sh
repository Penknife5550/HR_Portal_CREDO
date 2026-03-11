#!/bin/sh
# =============================================
# CREDO HR-Portal - Docker Entrypoint
# Fuehrt Prisma Migrationen aus und startet Next.js
# =============================================

echo "🏫 CREDO HR-Portal startet..."

# Prisma Migrationen ausfuehren
echo "📦 Datenbank-Migrationen werden ausgefuehrt..."
npx prisma migrate deploy 2>&1 || echo "⚠️ Migration fehlgeschlagen oder keine Migrationen vorhanden"

# Next.js starten
echo "🚀 Next.js Server startet auf Port $PORT..."
exec node server.js

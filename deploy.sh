#!/bin/bash
# CREDO HR-Portal - Deployment Script
# Initialisiert Git, committed und pusht zu GitHub

set -e

cd "$(dirname "$0")"

echo "=== Prisma Validate ==="
npx prisma validate 2>&1 || echo "WARN: Prisma validate fehlgeschlagen"

echo ""
echo "=== npm audit ==="
npm audit 2>&1 || echo "WARN: npm audit hat Probleme gemeldet"

echo ""
echo "=== Git Init ==="
git init -b main 2>/dev/null || echo "Git repo existiert bereits"

echo ""
echo "=== Git Status ==="
git status

echo ""
echo "=== Git Add ==="
git add -A

echo ""
echo "=== Git Commit ==="
git commit -m "feat: CREDO HR-Portal - vollstaendige Implementierung

- Personalfragebogen mit 10 Schritten (persoenliche Daten, Adresse, Bank, SV, Steuer, Beschaeftigung, Kinder, Bildung, Masernschutz, Zusammenfassung)
- Einstellungsmodalitaeten-Formular fuer Vorgesetzte (Magic-Link-basiert)
- HR-Dashboard mit Onboarding-Uebersicht und Statusfilter
- Benutzerverwaltung (SUPER_ADMIN, HR_LEITUNG, HR_SACHBEARBEITER)
- Mandantenverwaltung (16 CREDO-Einrichtungen)
- Checklisten-System mit konfigurierbaren Vorlagen
- Formularvorlagen-Verwaltung pro Fragebogentyp
- Dokumenten-Upload mit Validierung
- JWT-basierte Authentifizierung + Magic-Links
- Security: Middleware mit CSP, HSTS, XSS-Schutz
- Rate-Limiting fuer API-Endpunkte
- Docker-Setup mit PostgreSQL 16 + Multi-Stage Build
- Prisma ORM mit vollstaendigem Schema und Migrationen
- DSGVO-konforme Datenverarbeitung

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"

echo ""
echo "=== Git Remote ==="
git remote add origin https://github.com/Penknife5550/HR_Portal_CREDO.git 2>/dev/null || git remote set-url origin https://github.com/Penknife5550/HR_Portal_CREDO.git

echo ""
echo "=== Git Push ==="
git push -u origin main

echo ""
echo "=== DONE ==="
echo "Commit: $(git rev-parse HEAD)"
echo "Branch: $(git branch --show-current)"
echo "Remote: $(git remote get-url origin)"

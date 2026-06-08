# BEM-Modul — Server-Deploy & Verifikation (E0–E5)

> Ziel: das BEM-Modul (E0–E5) auf dem Produktions-Server **fes-vm-ubuntudocker**
> ausrollen und alle offline NICHT testbaren Funktionen (DB-Schema, SMTP-Mail,
> Gotenberg-PDF, Magic-Links) verifizieren.
>
> Server-Pfad: `/vol/container/HR_Portal_CREDO` · Domain: `hr.fes-credo.de`

---

## 0. Vorbereitung (lokal, einmalig)

1. **`BEM_ENCRYPTION_KEY` erzeugen** (64 Hex-Zeichen, getrennt vom `ENCRYPTION_KEY`):
   ```bash
   openssl rand -hex 32
   ```
   Wert notieren — er kommt gleich in die `.env` auf dem Server.
   ⚠️ Diesen Schluessel **sicher aufbewahren**: ohne ihn sind die verschluesselten
   BEM-Freitexte (Gespraechsnotizen, Massnahmen) unwiederbringlich verloren.

2. **Branch nach origin pushen:**
   ```bash
   git push -u origin feat/bem-e0-vorlagenbibliothek
   ```
   (Optional: PR nach `main` erstellen und mergen — dann unten `main` statt des
   Feature-Branches deployen.)

---

## 1. Deploy auf dem Server

```bash
# 1) Auf den Server, ins Projektverzeichnis
ssh fes-vm-ubuntudocker
cd /vol/container/HR_Portal_CREDO

# 2) Code holen
git fetch origin
git checkout feat/bem-e0-vorlagenbibliothek   # oder: git checkout main && git pull
git pull

# 3) .env ergaenzen — NEUER Pflicht-Eintrag (Container startet sonst NICHT):
#    BEM_ENCRYPTION_KEY=<der oben erzeugte 64-Hex-Wert>
#    (GOTENBERG_URL ist seit E0 vorhanden: http://gotenberg:3000)
nano .env

# 4) Build & Start (baut auch den Gotenberg-Sidecar aus docker-compose.yml)
sudo docker compose up -d --build
```

Der `entrypoint.sh` prueft beim Start automatisch die Pflicht-Variablen
(`JWT_SECRET`, `ENCRYPTION_KEY`, **`BEM_ENCRYPTION_KEY`**, `DATABASE_URL`), fuehrt
`prisma db push` aus (legt alle BEM-Tabellen an) und startet den Server.

```bash
# Logs verfolgen (auf "Umgebungsvariablen geprueft: OK" + "Server gestartet" achten)
sudo docker compose logs -f app
```

### Wenn der Container sofort beendet
Meist fehlt `BEM_ENCRYPTION_KEY` oder ist zu kurz. Log-Zeile:
`FATAL: BEM_ENCRYPTION_KEY muss als 64-stelliger Hex-String ...` → Wert in `.env`
korrigieren, `sudo docker compose up -d` erneut.

---

## 2. Smoke-Checks (Infrastruktur)

```bash
# DB-Schema enthaelt die BEM-Tabellen?
sudo docker exec hr-portal-db psql -U hrportal -d hr_portal -c "\dt bem_*"
# erwartet: bem_faelle, bem_zugriffe, bem_gespraeche, bem_massnahmen,
#           bem_einwilligungen, bem_dokumente, bem_fristen, bem_kommunikation

# Gotenberg laeuft und ist intern erreichbar?
sudo docker compose ps gotenberg
sudo docker exec hr-portal-app curl -s -o /dev/null -w "%{http_code}" http://gotenberg:3000/health
# erwartet: 200

# App-Health
sudo docker exec hr-portal-app curl -s http://localhost:3000/api/health
```

**SMTP** (fuer BEM-Einladungen, SMTP-direkt) muss im Admin-Portal konfiguriert &
aktiv sein: **Einstellungen → SMTP** → Host/User/Passwort → „Verbindung testen".
Ohne aktive SMTP-Konfiguration schlaegt der Einladungs-Versand mit 502 fehl
(der Magic-Link wird dann zur manuellen Zustellung angezeigt).

---

## 3. Funktionale Verifikation (im Browser, `https://hr.fes-credo.de`)

Voraussetzung: als **SUPER_ADMIN** anmelden (darf BEM-Faelle anlegen). Fuer den
Test ggf. einen Nutzer als BEM-Beauftragte:n markieren.

| # | Schritt | Erwartet | deckt ab |
|---|---------|----------|----------|
| 1 | Nav „🔒 BEM" → „+ Neuer Fall" anlegen (Mandant + Name) | Fall erscheint in Liste, Anlegende:r ist auto-freigegeben | E1/E2 |
| 2 | Mit einem NICHT-freigegebenen Account die Fall-URL oeffnen | „nicht gefunden" (404), kein Inhalt | E1 (versiegelte Akte) |
| 3 | Detailseite: Stepper + „Naechster Schritt"-Banner sichtbar | Status `ANGELEGT`, Button „Einladung versenden" | E2 |
| 4 | Tab Gespraeche → Erstgespraech mit Notiz + Checkliste anlegen | erscheint; Notiz in DB verschluesselt (s.u.) | E3 |
| 5 | Tab Massnahmen → Massnahme anlegen, Status setzen | erscheint mit Status | E3 |
| 6 | Tab Einwilligung → „Einladung digital versenden" an eigene Test-Mail | Mail kommt an, **im CREDO-CI-Layout**, mit Button | E4 |
| 7 | Link in der Mail oeffnen (ggf. ausgeloggt/Inkognito) → „Ich stimme zu" + Name | Bestaetigungsseite; Fall-Status → `EINWILLIGUNG_ERTEILT` | E4 |
| 8 | Denselben Link erneut oeffnen | „bereits beantwortet" (Single-Use) | E4 |
| 9 | Tab Einwilligung → „Widerrufen" | Status → `WIDERRUFEN` + Eintrag im Protokoll | E4 |
| 10 | Tab Dokumente → „Dokument aus Vorlage erzeugen" (Word) | Word-Datei wird abgelegt + Download funktioniert | E5 |
| 11 | dito als **PDF** | PDF wird via Gotenberg erzeugt (sonst 502 → Gotenberg pruefen) | E5/Gotenberg |
| 12 | Kopf → „Gesamt-Export (PDF)" | vollstaendiges Akten-PDF (DSGVO Art. 15) | E5 |
| 13 | Tab Protokoll | Versandnachweis (Mail mit Message-ID) + Zugriffs-/Aenderungsprotokoll lueckenlos | NFR 0a |

### Verschluesselung stichprobenartig pruefen (Notiz liegt NICHT im Klartext)
```bash
sudo docker exec hr-portal-db psql -U hrportal -d hr_portal \
  -c "SELECT left(notizen,40) FROM bem_gespraeche ORDER BY \"createdAt\" DESC LIMIT 1;"
# erwartet: ein Wert im Format iv:authTag:ciphertext (Base64), KEIN Klartext
```

### BEM-Vorlagen hinterlegen (fuer Schritt 10/11)
Die 7 CREDO-Word-Vorlagen (Ordner `BEM/`) im Admin-Portal hochladen:
**Vorlagen → Brief-Vorlagen → „+ Neue Vorlage"**, Modul **BEM** waehlen.
Platzhalter im Word-Dokument z.B. `{name}`, `{mandant}`, `{datum}`, `{fall_nummer}`.

---

## 4. Rollback

```bash
cd /vol/container/HR_Portal_CREDO
git checkout <vorheriger-commit-oder-main>
sudo docker compose up -d --build
```
`prisma db push` ist additiv (neue Tabellen). Ein Rollback des Codes laesst die
BEM-Tabellen bestehen (leer/ungenutzt) — kein Datenverlust an bestehenden Modulen.

---

## 5. Bekannte Punkte
- **Aktentrennung:** Die Ablage (NUR_BEM / Kopie/Original Personalakte) wird pro
  Dokument korrekt gekennzeichnet; die tatsaechliche Uebernahme der bereinigten
  Kopie in die Personalakte ist bewusst ein **manueller** Schritt (Sichtpruefung).
- **Last-Write-Wins** bei gleichzeitigem Editieren (wie restliches Portal).
- **E-Mail-Logo:** `public/credo_logo.png` muss erreichbar sein (wird per `APP_URL`
  in die Mail eingebettet).
- Vorbestehender, BEM-unabhaengiger Test-Fehler: `offboarding.test.ts` (Mock-Drift).

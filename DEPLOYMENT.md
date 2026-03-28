# HR-Portal — Deployment-Anleitung

## Systemanforderungen

- Docker + Docker Compose (v2.x)
- Min. 2 GB RAM, 10 GB Disk
- Reverse Proxy (Nginx/Traefik/Caddy) mit SSL-Terminierung
- Domain: `hr.fes-credo.de` (oder eigene Domain)

## Installation

### 1. Repository klonen

```bash
git clone <repo-url> hr-portal
cd hr-portal
```

### 2. Produktions-Environment erstellen

```bash
cp .env.production.example .env.production
```

Alle Werte in `.env.production` anpassen — insbesondere:

```bash
# Sicheres Datenbank-Passwort
DB_PASSWORD=$(openssl rand -base64 24)

# JWT Secret
JWT_SECRET=$(openssl rand -base64 48)

# Verschluesselungsschluessel fuer sensible Personaldaten
ENCRYPTION_KEY=$(openssl rand -hex 32)

# Cron-Absicherung
CRON_SECRET=$(openssl rand -base64 24)
```

### 3. Container starten

```bash
docker compose -f docker-compose.prod.yml up -d
```

Beim ersten Start werden automatisch:
- Datenbank-Schema erstellt (Prisma)
- Admin-User angelegt (Seed)

### 4. Reverse Proxy konfigurieren

**Caddy (empfohlen):**

```
hr.fes-credo.de {
    reverse_proxy localhost:3000
}
```

**Nginx:**

```nginx
server {
    listen 443 ssl;
    server_name hr.fes-credo.de;

    ssl_certificate     /etc/ssl/certs/hr.fes-credo.de.pem;
    ssl_certificate_key /etc/ssl/private/hr.fes-credo.de.key;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 5. Funktionstest

```bash
curl https://hr.fes-credo.de/api/health
# Erwartete Antwort: {"status":"ok","timestamp":"..."}
```

## Update

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

Die Datenbank-Migrationen werden automatisch beim Container-Start ausgefuehrt.

## Backup

### Automatisch (empfohlen)

Cronjob einrichten:

```bash
chmod +x scripts/backup.sh
crontab -e
# Taeglich um 02:00 Uhr:
0 2 * * * cd /pfad/zum/hr-portal && ./scripts/backup.sh >> /var/log/hr-portal-backup.log 2>&1
```

### Manuell

```bash
./scripts/backup.sh
```

Backups liegen im Verzeichnis `./backups/` und werden nach 30 Tagen automatisch geloescht.

### Backup wiederherstellen

```bash
docker exec -i hr-portal-db pg_restore -U hrportal -d hr_portal -c /backups/hr_portal_DATUM.dump
```

## Monitoring

- **Health Check:** `GET /api/health` — prueft Datenbank-Verbindung
- **Docker Logs:** `docker compose -f docker-compose.prod.yml logs -f app`
- **Container Status:** `docker compose -f docker-compose.prod.yml ps`

## Fehlerbehebung

| Problem | Loesung |
|---------|---------|
| Container startet nicht | `docker compose -f docker-compose.prod.yml logs app` pruefen |
| DB nicht erreichbar | `docker compose -f docker-compose.prod.yml logs db` pruefen |
| Health Check schlaegt fehl | Datenbank-Verbindung und `DATABASE_URL` pruefen |
| Seed laeuft nicht | `ADMIN_INITIAL_PASSWORD` in `.env.production` setzen |

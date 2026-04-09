# =============================================
# CREDO HR-Portal - Multi-Stage Docker Build
# Basierend auf Next.js 15 Standalone Output
# =============================================

# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts
# Generate Prisma Client
COPY prisma ./prisma
RUN npx prisma generate

# Stage 2: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build
# Seed-Script bundeln (inkl. Imports aus src/lib/**) zu einem einzelnen JS-File.
# tsc scheidet aus, weil seed.ts aus ../src/lib importiert und damit der
# rootDir auf den Projekt-Root waechst — die Ausgabe wuerde in
# prisma/compiled/prisma/seed.js landen, nicht in prisma/compiled/seed.js.
# esbuild bundelt alle TS-Imports in eine Datei, @prisma/client und bcryptjs
# bleiben als externe require()-Aufrufe erhalten (sind im Runner verfuegbar).
RUN npx --yes esbuild@0.24 prisma/seed.ts \
    --bundle \
    --platform=node \
    --target=node20 \
    --format=cjs \
    --external:@prisma/client \
    --external:bcryptjs \
    --outfile=prisma/compiled/seed.js \
 && test -f prisma/compiled/seed.js

# Stage 3: Production
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN apk add --no-cache curl
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy standalone build
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Prisma: Schema fuer Migrationen + generierter Client fuer Runtime
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
# Kompiliertes Seed-Script (JS) fuer Produktion
COPY --from=builder --chown=nextjs:nodejs /app/prisma/compiled/seed.js ./prisma/seed.js
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
# bcryptjs wird vom Seed benoetigt
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/bcryptjs ./node_modules/bcryptjs

# Prisma CLI global installieren - Version muss mit package-lock.json uebereinstimmen!
RUN npm install -g prisma@6.19.2

# Create uploads directory
RUN mkdir -p /app/uploads && chown nextjs:nodejs /app/uploads

# Entrypoint script (sed entfernt Windows CRLF-Zeilenumbrueche)
COPY --chown=nextjs:nodejs entrypoint.sh ./
RUN sed -i 's/\r$//' entrypoint.sh && chmod +x entrypoint.sh

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["./entrypoint.sh"]

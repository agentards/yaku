# Una sola imagen: la PWA compilada (dist/) + el servidor local (Node + node:sqlite, sin dependencias en runtime).
# Sin Cloudflare. Base de datos y fotos en el volumen /datos. Detalles: servidor-local/README.md
FROM node:24-alpine AS compilar
WORKDIR /src
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 CI=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Clave PÚBLICA de Clerk para el login del front (opcional; sin ella el Centro de monitoreo usa PIN).
ARG VITE_CLERK_PUBLISHABLE_KEY=
RUN npx vite build && node servidor-local/empaquetar.mjs

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080 HOST=0.0.0.0 YAKU_DIST=/app/dist YAKU_DATOS=/datos
# Login en runtime (servidor-local/README.md): CLERK_PUBLISHABLE_KEY o CLERK_JWT_KEY, CLERK_AUTHORIZED_PARTIES,
# CLERK_ISSUER, YAKU_PERMITIR_PIN. La caché del JWKS queda en /datos/clerk-jwks.json (sigue validando sin red).
COPY --from=compilar /src/dist ./dist
COPY --from=compilar /src/servidor-local/salida/servidor.mjs ./servidor.mjs
RUN mkdir -p /datos && chown node:node /datos
USER node
VOLUME ["/datos"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD wget -qO- http://127.0.0.1:8080/salud >/dev/null || exit 1
CMD ["node", "servidor.mjs"]

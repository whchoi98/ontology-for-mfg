FROM --platform=linux/arm64 public.ecr.aws/docker/library/node:24-slim AS deps
WORKDIR /app
COPY web/package*.json ./
# Plain `npm ci` (same as CI): the peer graph resolves cleanly since the
# Next 16 / React 19 upgrade — see the `overrides` note in web/CLAUDE.md.
RUN npm ci

FROM --platform=linux/arm64 public.ecr.aws/docker/library/node:24-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY web/ .
RUN npm run build

FROM --platform=linux/arm64 public.ecr.aws/docker/library/node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# The runtime only runs `node server.js`. The npm CLI bundled in the base image
# carried the image's fixable HIGH findings (brace-expansion, undici).
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
# Next.js standalone output does NOT auto-copy public/ — must be copied
# explicitly or every static asset (favicon, codegraph snapshots, etc.)
# returns 404 at the origin.
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]

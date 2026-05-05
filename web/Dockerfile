FROM --platform=linux/arm64 public.ecr.aws/docker/library/node:20-slim AS deps
WORKDIR /app
COPY web/package*.json ./
RUN npm ci --legacy-peer-deps

FROM --platform=linux/arm64 public.ecr.aws/docker/library/node:20-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY web/ .
RUN npm run build

FROM --platform=linux/arm64 public.ecr.aws/docker/library/node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]

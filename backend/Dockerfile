# backend/Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src ./src
COPY config ./config
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/config ./config
# Drizzle migrations are .sql files that tsc does not emit; ship them alongside dist
# so the migrate step can find ./src/db/migrations at runtime.
COPY --from=builder /app/src/db/migrations ./src/db/migrations
COPY package.json ./
EXPOSE 8080
CMD ["node", "dist/index.js"]

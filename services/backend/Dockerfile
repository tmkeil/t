# --- builder: builds @app/shared ---
FROM node:18-bookworm-slim AS builder
WORKDIR /app

# Workspaces: root + BE + shared
COPY package.json package-lock.json ./
COPY services/backend/package.json ./services/backend/
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/
# Complete Source to build shared
COPY . .

# Allow TS-build
RUN npm ci || npm i
RUN npm -w @app/shared run build


# --- runtime: Only productions-deps + built shared/dist ---
FROM node:18-bookworm-slim
WORKDIR /app

# Workspaces
COPY package.json package-lock.json ./
COPY services/backend/package.json ./services/backend/
COPY packages/shared/package.json ./packages/shared/

# Productions-Deps
RUN npm ci --omit=dev || npm i --omit=dev

# Copy Backend-Source
COPY services/backend /app/services/backend
# Copy built shared
COPY --from=builder /app/packages/shared/dist /app/packages/shared/dist

WORKDIR /app/services/backend
EXPOSE 3000
CMD ["npm","start"]






# FROM node:18-alpine

# WORKDIR /app

# COPY package.json package-lock.json ./

# COPY services/backend/package.json ./services/backend/
# COPY packages/shared/package.json ./packages/shared/

# # Build-Tools + SQLite-Header
# RUN apk add --no-cache python3 make g++ sqlite-dev

# # Force source-build
# ENV npm_config_build_from_source=true
# RUN npm ci --omit=dev || npm install --omit=dev

# COPY . .
# WORKDIR /app/services/backend
# EXPOSE 3000
# CMD ["npm","start"]
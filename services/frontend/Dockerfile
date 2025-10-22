# --- DEV stage ---
FROM node:18-alpine AS dev
WORKDIR /app

# Workspaces: root + FE + shared
COPY package.json package-lock.json ./
COPY services/frontend/package.json services/frontend/tsconfig.json ./services/frontend/
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/

RUN npm ci || npm i

# Sourcecode comes via volume
EXPOSE 5173
WORKDIR /app/services/frontend

# Important: Building shared first (source comes via volume)
CMD ["sh","-c","npm -w @app/shared run build && npm run dev -- --host 0.0.0.0"]


# --- PROD build ---
FROM node:18-alpine AS builder
WORKDIR /app
COPY . .
RUN npm ci || npm i
# First build shared, then FE
RUN npm -w @app/shared run build
RUN npm --workspace services/frontend run build

# --- PROD serve ---
FROM nginx:stable-alpine
COPY --from=builder /app/services/frontend/dist/ /usr/share/nginx/html/
EXPOSE 80

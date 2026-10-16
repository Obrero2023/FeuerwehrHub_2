FROM node:20-slim AS builder
WORKDIR /app

# COPY both manifest and lockfile for deterministic installs
COPY package.json package-lock.json ./
RUN npm ci --prefer-offline --no-audit --progress=false

COPY . .
RUN npm run build

# Runtime stage
FROM nginx:1.25-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

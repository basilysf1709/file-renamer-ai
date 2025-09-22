# syntax=docker/dockerfile:1

FROM node:20-alpine AS deps
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY frontend .
ENV NEXT_TELEMETRY_DISABLED=1

# Accept build args for Next.js public env vars
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID
ARG NEXT_PUBLIC_GOOGLE_API_KEY
ARG NEXT_PUBLIC_BACKEND_BASE

# Make them available as env vars during build
ENV NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID
ENV NEXT_PUBLIC_GOOGLE_API_KEY=$NEXT_PUBLIC_GOOGLE_API_KEY
ENV NEXT_PUBLIC_BACKEND_BASE=$NEXT_PUBLIC_BACKEND_BASE

RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3000
# Expect env via docker-compose: NEXT_PUBLIC_BACKEND_BASE, NEXT_PUBLIC_GOOGLE_CLIENT_ID, NEXT_PUBLIC_GOOGLE_API_KEY
CMD ["npm", "run", "start"] 
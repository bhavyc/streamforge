# Multi-Stage Dockerfile for StreamForge Media Transcoder
FROM node:22-bookworm-slim AS base

# Install FFmpeg and system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy application source code
COPY . .

# Build Next.js production bundle
RUN npm run build

# Expose Next.js default port
EXPOSE 3000

# Default command: Web server + Background Worker concurrently
CMD ["npm", "run", "start:all"]

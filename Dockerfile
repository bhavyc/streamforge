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

# Set host binding to 0.0.0.0 and port 10000 for Render cloud
ENV HOSTNAME="0.0.0.0"
ENV PORT=10000

# Expose Render default port exclusively
EXPOSE 10000

ENV NODE_OPTIONS="--max-old-space-size=380"

# Default command: Single lightweight process with unified worker
CMD ["npm", "run", "start"]

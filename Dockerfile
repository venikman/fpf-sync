# syntax=docker/dockerfile:1
# Build and run with Bun in production
FROM oven/bun:1 as base

WORKDIR /app

# Copy only manifest files first for better layer caching
COPY package.json bun.lock tsconfig.json ./

# Install deps
RUN bun install --ci

# Copy source
COPY scripts ./scripts
COPY docs ./docs
COPY yadisk ./yadisk
COPY README.md ./README.md

ENV NODE_ENV=production \
    PORT=8080 \
    FPF_DATA_DIR=/data

# Create data mount point (will be backed by Fly volume)
RUN mkdir -p /data && chown -R bun:bun /data

EXPOSE 8080

# Run the SSE MCP server
CMD ["bun", "run", "scripts/mcp/server-sse.ts"]
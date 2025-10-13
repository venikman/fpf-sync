# syntax=docker/dockerfile:1
# Build and run with Bun 1.3 in production
FROM oven/bun:1.3 as base

WORKDIR /app

# Copy manifest (no lockfile in repo)
COPY package.json ./

# Install dependencies
RUN bun install

# Copy source
COPY scripts ./scripts
COPY docs ./docs
COPY yadisk ./yadisk
COPY README.md ./README.md

ENV PORT=8080 \
    FPF_DATA_DIR=/data

# Create data mount point (will be backed by volume)
RUN mkdir -p /data && chown -R bun:bun /data

EXPOSE 8080

USER bun

# Run the SSE MCP server under Bun
CMD ["bun", "run", "scripts/mcp/server-sse.ts"]

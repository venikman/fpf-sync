# syntax=docker/dockerfile:1
# Build and run with Deno in production
FROM denoland/deno:alpine-2.5.4 as base

WORKDIR /app

# Copy Deno config and lock
COPY deno.json deno.lock ./

# Copy source
COPY scripts ./scripts
COPY docs ./docs
COPY yadisk ./yadisk
COPY README.md ./README.md

# Cache dependencies at build time
RUN deno cache scripts/mcp/server-sse.ts

ENV PORT=8080 \
    FPF_DATA_DIR=/data

# Create data mount point (will be backed by volume)
RUN mkdir -p /data && chown -R deno:deno /data

EXPOSE 8080

USER deno

# Run the SSE MCP server
CMD ["deno", "run", "--allow-read", "--allow-env", "--allow-net", "--allow-write", "scripts/mcp/server-sse.ts"]

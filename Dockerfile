# syntax=docker/dockerfile:1

# --- Stage 1: Extract official Ollama binary & CPU/GPU runners ---
FROM ollama/ollama:latest AS ollama-bin

RUN mkdir -p /ollama-stage/lib \
  && cp /bin/ollama /ollama-stage/ollama \
  && if [ -d /usr/lib/ollama ]; then cp -a /usr/lib/ollama /ollama-stage/lib/; fi

# --- Stage 2: Build frontend & compile native dependencies ---
FROM node:22-bookworm-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY . .
RUN npm run build
RUN npm prune --omit=dev

# --- Stage 3: Self-contained production runtime (Tarsel Mail + Local Ollama) ---
FROM node:22-bookworm-slim AS runner

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libstdc++6 \
    libgomp1 \
  && rm -rf /var/lib/apt/lists/*

COPY --from=ollama-bin /ollama-stage/ollama /usr/local/bin/ollama
COPY --from=ollama-bin /ollama-stage/lib/ /usr/lib/

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/data
ENV OLLAMA_MODELS=/data/ollama
ENV OLLAMA_HOST=127.0.0.1:11434
ENV AI_PROVIDER=ollama
ENV AI_BASE_URL=http://127.0.0.1:11434/v1
ENV AI_MODEL=qwen2.5:3b
ENV OLLAMA_AUTO_PULL=true

RUN mkdir -p /data /data/ollama && chown -R node:node /data /app

COPY --from=builder --chown=node:node /app/package.json ./
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/server.ts ./server.ts
COPY --from=builder --chown=node:node /app/src ./src
COPY --from=builder --chown=node:node /app/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=node:node /app/docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x /app/docker-entrypoint.sh

USER node

VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then((r)=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]

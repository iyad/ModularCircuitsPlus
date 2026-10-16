# Bits & Gates production image: Express API + built React client in one Node process.
# The Auth0 values are public (they are baked into the client bundle), so build args are fine here.
#   docker build -t bits-and-gates:<tag> \
#     --build-arg VITE_AUTH0_DOMAIN=... --build-arg VITE_AUTH0_CLIENT_ID=... --build-arg VITE_AUTH0_AUDIENCE=... .

FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN npm install -g pnpm@11.5.3
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY packages/core/package.json packages/core/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN pnpm install --frozen-lockfile
COPY packages packages
ARG VITE_AUTH0_DOMAIN
ARG VITE_AUTH0_CLIENT_ID
ARG VITE_AUTH0_AUDIENCE
RUN pnpm build

FROM node:22-bookworm-slim
WORKDIR /app
RUN npm install -g pnpm@11.5.3
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json packages/core/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
# Production dependencies of the server and its workspace deps (core) only.
RUN pnpm install --frozen-lockfile --prod --filter "@mcp/server..."
COPY --from=build /app/packages/core/dist packages/core/dist
COPY --from=build /app/packages/server/dist packages/server/dist
COPY --from=build /app/packages/client/dist packages/client/dist
# Starter library, copied to the data volume on first start only.
COPY circuits.db /app/seed/circuits.db

ENV NODE_ENV=production PORT=3001 DB_PATH=/data/circuits.db
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "[ -f \"$DB_PATH\" ] || cp /app/seed/circuits.db \"$DB_PATH\"; exec node packages/server/dist/index.js"]

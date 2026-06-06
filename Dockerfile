FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /app

FROM base AS build
COPY . .
RUN CI=true pnpm install --frozen-lockfile
RUN pnpm exec tsc -p packages/shared/tsconfig.json && pnpm exec tsc -p backend/tsconfig.json

FROM base AS production
ENV NODE_ENV=production

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY backend/package.json ./backend/
COPY packages/mcp-server/package.json ./packages/mcp-server/
RUN pnpm install --frozen-lockfile --prod

COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/backend/dist ./backend/dist
COPY backend/drizzle.config.ts ./backend/

EXPOSE 3000
CMD ["node", "backend/dist/index.js"]

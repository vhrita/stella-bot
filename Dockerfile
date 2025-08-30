FROM node:lts-slim

WORKDIR /app
COPY package.json pnpm-lock.yaml* yarn.lock* package-lock.json* ./
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN pnpm install --frozen-lockfile || pnpm install

COPY . .
RUN pnpm build

ENV NODE_ENV=production
CMD ["node", "dist/index.js"]

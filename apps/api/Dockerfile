FROM node:20-bookworm-slim

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/rbac/package.json packages/rbac/package.json
COPY packages/pdf-templates/package.json packages/pdf-templates/package.json

RUN pnpm install --frozen-lockfile --ignore-scripts=false

COPY apps/api apps/api
COPY packages packages
COPY ["Logo da Vulp Air by Claudiatech.png", "./Logo da Vulp Air by Claudiatech.png"]

RUN pnpm --filter @vulp/api exec prisma generate
RUN pnpm --filter @vulp/api exec playwright install --with-deps chromium
RUN pnpm turbo run build --filter=@vulp/api
RUN chmod +x /app/apps/api/docker-start.sh

EXPOSE 3001

CMD ["/app/apps/api/docker-start.sh"]

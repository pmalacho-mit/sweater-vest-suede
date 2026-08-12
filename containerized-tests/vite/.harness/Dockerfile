FROM node:22-bookworm-slim

ARG TEST_CASE=live-reload
ARG HARNESS=single

WORKDIR /app

COPY containerized-tests/vite/.harness/base/package.json ./package.json
RUN --mount=type=cache,target=/root/.npm \
  npm install --no-audit --prefer-offline --progress=false

COPY containerized-tests/vite/.harness/base/ ./

COPY containerized-tests/vite/.harness/${HARNESS}.ts ./src/main.ts

COPY --exclude=**/*test.ts --exclude=release containerized-tests/vite/${TEST_CASE}/ ./src/

# `release/` resolves its suede dependencies as siblings of itself, exactly as
# they sit in a consumer's project after install. Reproduce that layout here.
COPY release/ ./src/release/
COPY sweater-vest-suede.dockview-svelte-suede/ ./src/sweater-vest-suede.dockview-svelte-suede/

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173", "--strictPort"]
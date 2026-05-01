FROM node:22-bookworm-slim

ARG TEST_CASE=live-reload
ARG HARNESS=single

WORKDIR /app

COPY docker/vite/harness/${HARNESS}/package.json ./package.json
RUN --mount=type=cache,target=/root/.npm \
  npm install --no-audit --prefer-offline --progress=false

COPY --exclude=src/release docker/vite/harness/${HARNESS}/ ./

COPY --exclude=**/*.test.ts --exclude=release docker/vite/${TEST_CASE}/ ./src/

COPY release/ ./src/release/

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173", "--strictPort"]
FROM node:22-bookworm-slim

ARG TEST_CASE=live-reload

WORKDIR /app

COPY docker/vite/harness/package.json ./package.json
RUN npm install

COPY docker/vite/harness ./

# Overlay test-specific components into the harness app.
COPY docker/vite/${TEST_CASE}/Component.svelte ./src/Component.svelte
COPY docker/vite/${TEST_CASE}/Component.test.svelte ./src/Component.test.svelte

# Copy repository release artifacts into src/.
COPY release/ ./src/release/

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173", "--strictPort"]
# Stage 1: Build Rust WASM modules
FROM rust:1.84-bookworm AS wasm-builder

RUN curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
RUN rustup target add wasm32-unknown-unknown

WORKDIR /build
COPY rust/ ./rust/

RUN cd rust && wasm-pack build crates/ems-wasm --target web --out-dir /build/wasm-out

# Stage 2: Install npm dependencies
FROM node:22-bookworm-slim AS deps

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install

# Stage 3: Dev server
FROM node:22-bookworm-slim AS dev

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
COPY --from=wasm-builder /build/wasm-out ./wasm-pkg
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 5173
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npx", "vite", "--host"]

# Stage 4: Production build
FROM node:22-bookworm-slim AS prod

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
COPY --from=wasm-builder /build/wasm-out ./src/wasm-pkg

RUN npx tsc && npx vite build

FROM nginx:alpine AS serve
COPY --from=prod /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

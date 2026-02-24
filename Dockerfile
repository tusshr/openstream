FROM oven/bun AS build

WORKDIR /app

COPY package.json package.json
COPY bun.lock bun.lock

RUN bun install

COPY ./src ./src

ENV NODE_ENV=production

RUN bun build \
	--compile \
	--minify-whitespace \
	--minify-syntax \
	--outfile server \
	src/index.ts

FROM gcr.io/distroless/base-debian12

WORKDIR /app

COPY --from=build --chown=nonroot:nonroot /app/server server

ENV NODE_ENV=production

USER nonroot:nonroot

CMD ["./server"]

EXPOSE 8080
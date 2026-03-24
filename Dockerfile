FROM oven/bun:1.3.14-debian AS build

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY ./src ./src

ENV NODE_ENV=production

RUN bun build \
    --compile \
    --minify-whitespace \
    --minify-syntax \
    --target bun \
    --outfile api \
    src/index.ts

RUN bun build \
    --compile \
    --minify-whitespace \
    --minify-syntax \
    --target bun \
    --outfile worker \
    src/worker.ts


FROM gcr.io/distroless/base-debian12

WORKDIR /app

COPY --from=build --chown=nonroot:nonroot /app/api /app/api
COPY --from=build --chown=nonroot:nonroot /app/worker /app/worker

ENV NODE_ENV=production

USER nonroot:nonroot

# The API runs with the default Snowflake WORKER_ID=0. Run the worker service
# from this same image with a DISTINCT id (command ["./worker"], env
# WORKER_ID=1) so the two processes can't mint colliding ids.
CMD ["./api"]

EXPOSE 8080
EXPOSE 8081

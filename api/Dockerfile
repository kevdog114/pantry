FROM node:22-alpine

ARG TARGETARCH
ENV PRISMA_SKIP_POSTINSTALL_GENERATE=true
ENV PRISMA_CLI_BINARY_TARGETS=${TARGETARCH:+linux-musl-${TARGETARCH}}

RUN apk add --no-cache python3 py3-setuptools make g++ openssl openssl-dev

RUN mkdir /app
RUN mkdir /app/data
RUN mkdir /app/data/upload
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN if [ "$TARGETARCH" = "amd64" ]; then \
    export PRISMA_CLI_BINARY_TARGETS=linux-musl-x64; \
    elif [ "$TARGETARCH" = "arm64" ]; then \
    export PRISMA_CLI_BINARY_TARGETS=linux-musl-arm64; \
    fi && \
    npx prisma generate

RUN chmod +x /app/run.sh

CMD ["/app/run.sh"]
# This is used by rebuild.sh to snapshot the node environment.
FROM node:20.11.0 as build
WORKDIR /usr/src/app
COPY tmp/package.json ./
COPY tmp/yarn.lock ./
COPY tmp/webpack.config.js ./
ENV YARN_CACHE_FOLDER=/root/.yarn
ENV NODE_OPTIONS=--openssl-legacy-provider
RUN \
  --mount=type=cache,target=/root/.yarn \
  --mount=type=cache,target=./node_modules/.cache/webpack \
   yarn install
ENTRYPOINT npm run build

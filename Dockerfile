# This is used by rebuild.sh to snapshot the node environment.
FROM node:22-bookworm as build
RUN mkdir -p /home/app/node_modules && chown -R node:node /home/app
WORKDIR /home/app
COPY package.json ./
COPY yarn.lock ./
COPY webpack.config.js ./

# USER node
ENV NODE_OPTIONS=--openssl-legacy-provider
# COPY --chown=node:node . .
ENV YARN_CACHE_FOLDER=/root/.yarn
RUN \
  --mount=type=cache,target=/root/.yarn \
  --mount=type=cache,target=./node_modules/.cache/webpack \
   yarn install
RUN yarn add webpack
CMD ["npm", "run", "build"]
# ENTRYPOINT
# ENTRYPOINT [ "npm", "run", "build" ]
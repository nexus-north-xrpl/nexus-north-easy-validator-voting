# Easy Validator Voting in a container. No npm packages are needed to run it.
FROM node:22-alpine
WORKDIR /app
COPY package.json LICENSE README.md ./
COPY src ./src
COPY public ./public
ENV EVV_DATA_DIR=/data
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8742
HEALTHCHECK --interval=60s --timeout=5s CMD wget -qO- http://127.0.0.1:${EVV_PORT:-8742}/healthz >/dev/null || exit 1
CMD ["node", "src/server.js"]

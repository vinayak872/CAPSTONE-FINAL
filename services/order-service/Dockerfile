# Multi-stage Dockerfile for Order Processing Microservice
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

COPY services/order-service/package*.json ./
RUN npm install --production

COPY services/order-service/src ./src

FROM node:20-alpine AS runner

WORKDIR /usr/src/app

ENV NODE_ENV=production
ENV PORT=5006
ENV HOST=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nodeapp

COPY --from=builder --chown=nodeapp:nodejs /usr/src/app/node_modules ./node_modules
COPY --from=builder --chown=nodeapp:nodejs /usr/src/app/src ./src
COPY --from=builder --chown=nodeapp:nodejs /usr/src/app/package*.json ./

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:5006/health || exit 1

EXPOSE 5006

USER nodeapp

CMD ["node", "src/server.js"]

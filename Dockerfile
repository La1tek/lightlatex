FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine

# Install TeX Live (minimal)
RUN apk add --no-cache \
    texlive \
    && rm -rf /var/cache/apk/*

WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/public ./public
COPY --from=builder /app/src/templates ./src/templates

RUN mkdir -p /app/data/projects

EXPOSE 3000
ENV NODE_ENV=production

CMD ["node", "dist/index.js"]

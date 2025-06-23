# ---- Base Stage ----
FROM node:20-alpine AS base
WORKDIR /usr/src/app

# ---- Dependencies Stage ----
FROM base AS dependencies
# Install build tools needed for native addon compilation
RUN apk add --no-cache build-base g++ cairo-dev jpeg-dev pango-dev giflib-dev python3
COPY package*.json ./
RUN npm cache clean --force
RUN npm install --legacy-peer-deps

# ---- Development Stage ----
FROM base AS development
ENV NODE_ENV=development
RUN apk add --no-cache build-base g++ cairo-dev jpeg-dev pango-dev giflib-dev python3 curl
COPY --from=dependencies /usr/src/app/node_modules ./node_modules
COPY . .
CMD ["npm", "run", "dev"]

# ---- Production Stage ----
FROM base AS production
ENV NODE_ENV=production
RUN apk add --no-cache cairo jpeg pango giflib
COPY --from=dependencies /usr/src/app/node_modules ./node_modules
COPY . .
RUN npm run build

# Create and use a non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN chown -R appuser:appgroup /usr/src/app

# Switch to the non-root user
# USER appuser

# Copy the rest of the application code
COPY . .

EXPOSE 3000
# Run the application using the "start:web" script
CMD ["npm", "run", "start:web"] 
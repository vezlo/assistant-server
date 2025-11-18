# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including dev for building)
RUN npm ci && npm cache clean --force

# Copy source code, scripts, and knexfile
COPY src ./src
COPY scripts ./scripts
COPY knexfile.ts ./

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S vezlo -u 1001

# Copy package files
COPY package*.json ./

# Install only production dependencies (compiled migrations are used at runtime)
RUN npm ci --only=production && npm cache clean --force

# Copy built application (dist) and compiled migrations/knexfile from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist/src/migrations ./src/migrations
# Copy knexfile (compiled JS + TS source for reference)
COPY --from=builder /app/dist/knexfile.js ./knexfile.js
COPY --from=builder /app/knexfile.ts ./knexfile.ts
COPY --from=builder /app/scripts ./scripts

# Make entrypoint script executable and set ownership
RUN chmod +x ./scripts/entrypoint.sh && \
    chown -R vezlo:nodejs ./scripts

# Create logs directory
RUN mkdir -p logs && chown -R vezlo:nodejs logs

# Switch to non-root user
USER vezlo

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application with migration runner
ENTRYPOINT ["dumb-init", "--"]
CMD ["./scripts/entrypoint.sh", "node", "dist/src/server.js"]
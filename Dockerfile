# Use Node.js 20 Alpine for smaller image size
FROM node:20-alpine

# Install OpenSSL for Prisma and SQLite for database access
RUN apk add --no-cache openssl sqlite

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build TypeScript to JavaScript
RUN npm run build

# Remove devDependencies to save space and memory
RUN npm prune --production

# Expose port (not strictly needed for socket mode, but good practice)
EXPOSE 3000

# Start the bot with compiled JavaScript
CMD ["npm", "start"]

# ----------------------------
# Stage 1: C++ Builder
# ----------------------------
FROM node:18-alpine as builder

WORKDIR /app

# Install Alpine build tools
RUN apk add --no-cache \
    build-base \
    cmake \
    bash

# COPY TRUTH: Since context is './server', we just copy 'cpp' directly
COPY cpp ./cpp

# Build the binary
WORKDIR /app/cpp
RUN chmod +x build.sh && ./build.sh

# ----------------------------
# Stage 2: Node.js Runtime
# ----------------------------
FROM node:18-alpine

WORKDIR /app

# Install dependencies (Context is './server', so package.json is at root)
COPY package*.json ./
RUN npm install --no-optional && npm cache clean --force

# Copy the rest of the server code
COPY . .

# CRITICAL FIX: Copy binary from builder to the correct runtime location
# We place it in ./cpp/monte_carlo so your Node server finds it at "cpp/monte_carlo"
COPY --from=builder /app/cpp/monte_carlo ./cpp/monte_carlo

EXPOSE 5001

CMD ["npm", "start"]
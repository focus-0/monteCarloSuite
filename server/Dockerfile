# Stage 1: Build C++ components
# CHANGE: Use alpine here so the binary is compatible with the runtime stage
FROM node:18-alpine as builder

WORKDIR /app

# CHANGE: Install Alpine specific build tools (apk instead of apt-get)
RUN apk add --no-cache \
    build-base \
    cmake \
    bash

# Copy source code
COPY cpp ./cpp

# Build the C++ component
# We fail hard (remove || echo) because if the build fails in stage 1, 
# we want the docker build to stop, not ship a broken container.
RUN chmod +x cpp/build.sh && \
    cd cpp && \
    ./build.sh

# ---

# Stage 2: Production runtime
FROM node:18-alpine

WORKDIR /app

# Copy package files first (better caching)
COPY package*.json ./

# Install dependencies
RUN npm install --no-optional && npm cache clean --force

# Copy the rest of the application source
COPY . .

# CRITICAL FIX: Copy the COMPILED binary from the builder stage
# The build.sh outputs to cpp/monte_carlo
COPY --from=builder /app/cpp/monte_carlo ./cpp/monte_carlo

EXPOSE 5001

CMD ["npm", "start"]
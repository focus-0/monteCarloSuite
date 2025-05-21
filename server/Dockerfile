FROM node:18

WORKDIR /app

# Install C++ build dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    && rm -rf /var/lib/apt/lists/*

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install --no-optional && npm cache clean --force

# Copy the rest of the application
COPY . .

# Make build.sh executable
RUN chmod +x cpp/build.sh

# Build the C++ component
RUN cd cpp && ./build.sh || echo "C++ build failed, will fallback to JavaScript implementation"

EXPOSE 5001

CMD ["npm", "start"] 
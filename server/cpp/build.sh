#!/bin/bash

# Create build directory if it doesn't exist
mkdir -p build
cd build

# Configure and build
cmake ..
make -j$(nproc 2>/dev/null || sysctl -n hw.ncpu)

# Copy executable to parent directory
cp monte_carlo ../monte_carlo

echo "Build completed. Executable is at: $(pwd)/../monte_carlo" 
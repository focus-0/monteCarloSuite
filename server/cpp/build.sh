#!/bin/bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

# Create build directory if it doesn't exist
mkdir -p build
cd build

# Configure and build
cmake -DCMAKE_BUILD_TYPE=Release ..
make -j$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)

# Copy executable to parent directory
cp monte_carlo ../monte_carlo

echo "Build completed. Executable is at: $(pwd)/../monte_carlo"
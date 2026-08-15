#!/bin/bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
BUILD_DIR="$DIR/build/Release"
mkdir -p "$BUILD_DIR"

echo "=== Building MonteCarloSuite C++ Node-API Native Addon ==="

NODE_INCLUDE=$(node -e "const path=require('path'); const fs=require('fs'); const p1 = path.resolve(process.execPath, '../../include/node'); const p2 = path.resolve(process.execPath, '../include/node'); if (fs.existsSync(p1)) console.log(p1); else if (fs.existsSync(p2)) console.log(p2); else console.log('/usr/include/node');" 2>/dev/null)
NAPI_INCLUDE=$(node -e "console.log(require('path').resolve(require.resolve('node-addon-api'), '..'));" 2>/dev/null)
CPP_SRC="$DIR/cpp/src"

FLAGS="-O3 -march=native -std=c++17 -pthread -ffast-math"

echo "Using Node include: $NODE_INCLUDE"
echo "Using NAPI include: $NAPI_INCLUDE"

if [[ "$OSTYPE" == "darwin"* ]]; then
    clang++ $FLAGS -dynamiclib -undefined dynamic_lookup \
        -I"$NODE_INCLUDE" \
        -I"$NAPI_INCLUDE" \
        -I"$CPP_SRC" \
        "$CPP_SRC/node_addon.cpp" \
        -o "$BUILD_DIR/monte_carlo_addon.node"
else
    g++ $FLAGS -fPIC -shared \
        -I"$NODE_INCLUDE" \
        -I"$NAPI_INCLUDE" \
        -I"$CPP_SRC" \
        "$CPP_SRC/node_addon.cpp" \
        -o "$BUILD_DIR/monte_carlo_addon.node"
fi

echo "=== Node-API Addon Built Successfully: $BUILD_DIR/monte_carlo_addon.node ==="

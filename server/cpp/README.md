# C++ Implementation for Monte Carlo Simulation

This directory contains the C++ implementation of the Black-Scholes Monte Carlo simulation. The C++ implementation offers significantly better performance compared to the JavaScript implementation, especially for a large number of trials.

## Prerequisites

To build the C++ code, you need:

- CMake (version 3.10 or higher)
- A C++ compiler with C++17 support (GCC, Clang, MSVC)
- Git (for fetching dependencies)

## Building

To build the C++ code, run:

```bash
./build.sh
```

This will:
1. Create a build directory
2. Configure the project with CMake
3. Build the executable
4. Copy the executable to the parent directory

## How It Works

The C++ implementation:
1. Receives input parameters as a JSON string
2. Performs the Monte Carlo simulation using multi-threading for better performance
3. Returns the results as a JSON string

## Advantages

- **Performance**: Much faster than JavaScript, especially for large simulations
- **Multi-threading**: Automatically uses all available CPU cores
- **Precision**: Better numerical precision for financial calculations

## Integration with Node.js

The C++ executable is called by Node.js using child processes. If the C++ executable is not available, the server will automatically fall back to the JavaScript implementation. 
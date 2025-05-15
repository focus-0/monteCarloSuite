# Monte Carlo Simulation Suite

A web application for pricing options using Monte Carlo simulation with the Black-Scholes model.

## Features

- Price European options using Monte Carlo simulation
- Visualize option prices with confidence intervals
- Adjust all Black-Scholes parameters (stock price, strike price, volatility, etc.)
- Support for both call and put options
- **High-performance C++ backend** with JavaScript fallback

## Technologies Used

- **MongoDB**: Database (not currently used in this version)
- **Express.js**: Backend framework
- **React**: Frontend library
- **Node.js**: JavaScript runtime
- **Chart.js**: For data visualization
- **C++**: High-performance backend implementation

## Setup Instructions

### Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)
- For C++ backend (optional but recommended for better performance):
  - CMake (v3.10 or higher)
  - C++ compiler with C++17 support
  - Git

### Installation

1. Clone the repository
2. Install dependencies:

```bash
# Install root dependencies
npm install

# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install
```

### Building the C++ Backend (Optional)

The C++ backend provides significantly better performance for Monte Carlo simulations. To build it:

```bash
cd server/cpp
./build.sh
```

If the C++ backend fails to build, the application will automatically fall back to the JavaScript implementation.

### Running the Application

From the root directory:

```bash
# Run both client and server concurrently
npm run dev

# Run server only
npm run server

# Run client only
npm run client
```

The server will run on port 5001, and the client will run on port 3000.

## How It Works

The application uses Monte Carlo simulation to price European options:

1. Generates random stock price paths based on Geometric Brownian Motion
2. Calculates option payoffs at maturity for each path
3. Averages the payoffs and discounts to present value
4. Provides a 95% confidence interval for the option price

### Implementation Details

The application has two backend implementations:

1. **C++ Implementation**: 
   - Uses multi-threading for parallel computation
   - Significantly faster for large number of trials
   - Automatically used if available

2. **JavaScript Implementation**:
   - Used as fallback if C++ implementation is not available
   - Simpler but slower for large simulations

## Future Enhancements

- Add support for American options
- Implement more exotic option types (Asian, Barrier, etc.)
- Add more visualization features (stock price paths, etc.)
- Save simulation results to a database
- Add GPU acceleration for even faster Monte Carlo simulations
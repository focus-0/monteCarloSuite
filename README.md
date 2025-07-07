# Monte Carlo Simulation Suite

**Link**: https://montecarlosuitefe.onrender.com/

A web application for pricing options using Monte Carlo simulation with the Black-Scholes model.

## Features

- Price European options using Monte Carlo simulation
- Visualize option prices with confidence intervals
- Adjust all Black-Scholes parameters (stock price, strike price, volatility, etc.)
- Support for both call and put options
- **High-performance C++ backend** 
- **Dark Mode** with system preference detection and toggle

## User Interface

- Clean, modern interface with responsive design
- Intuitive parameter input forms
- Interactive charts and visualizations


## Technologies Used

- **MongoDB**: Database 
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

#### Running Locally

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

#### Running with Docker

The application can be deployed using Docker:

```bash
# Build and start the application
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the application
docker-compose down
```

The application will be available at http://localhost:5001.

## How It Works

The application uses Monte Carlo simulation to price European options:

1. Generates random stock price paths based on Geometric Brownian Motion
2. Calculates option payoffs at maturity for each path
3. Averages the payoffs and discounts to present value
4. Provides a 95% confidence interval for the option price

### Implementation Details

 **C++ Implementation**: 
   - Uses multi-threading for parallel computation
   - Significantly faster for large number of trials
   - Automatically used if available


## API Documentation

The application exposes the following REST API endpoints:

### Option Pricing Endpoints

#### `POST /api/blackscholes`

Prices a European option using the Black-Scholes model and Monte Carlo simulation.

**Request Body:**
```json
{
  "S0": 100,         // Initial stock price
  "K": 100,          // Strike price
  "r": 0.05,         // Risk-free rate (annual)
  "sigma": 0.2,      // Volatility (annual)
  "T": 1,            // Time to maturity (years)
  "isCall": true,    // Option type (true for call, false for put)
  "numTrials": 10000 // Number of Monte Carlo trials
}
```

**Response:**
```json
{
  "optionPrice": 10.45,           // Estimated option price
  "confidenceInterval": [10.2, 10.7], // 95% confidence interval
  "standardError": 0.13,          // Standard error of the estimate
  "analyticalPrice": 10.45,       // Black-Scholes formula price (for comparison)
  "executionTime": 0.15,          // Execution time in seconds
  "implementation": "cpp",        // Which implementation was used (cpp or js)
  "numThreads": 8                 // Number of threads used (C++ only)
}
```



## Developer Guide

### Project Structure

```
monte-carlo-suite/
├── client/                  # React frontend
│   ├── public/              # Static assets
│   └── src/
│       ├── components/      # React components
│       ├── App.js           # Main React component
│       ├── App.css          # Global styles
│       ├── index.js         # Application entry point
│       
│
├── server/                  # Node.js backend
│   ├── cpp/                 # C++ implementation
│   │   ├── include/         # Header files
│   │   ├── src/             # C++ source files
│   │   ├── CMakeLists.txt   # CMake build file
│   │   └── build.sh         # Build script
│   ├── routes/              # API route handlers
│   ├── models/              # Data models
│   ├── utils/               # Utility functions
│   └── server.js            # Server entry point
│
└── package.json             # Root package.json
```

### C++ Core Implementation

The C++ implementation uses an object-oriented approach with these key classes:

1. **Simulation** (Abstract Base Class):
   - Provides the template method pattern for parallel execution
   - Manages threading and work distribution

2. **BlackScholesSimulation**:
   - Implements Monte Carlo for option pricing
   - Calculates confidence intervals and standard error

3. **GBMSimulation**:
   - Implements Geometric Brownian Motion for stock price paths
   - Supports multiple time steps





## User Guide

### Option Pricing Simulator

1. **Getting Started**:
   - Navigate to the Option Simulator tab
   - Enter the required parameters:
     - Initial Stock Price (S₀): Current price of the underlying stock
     - Strike Price (K): The price at which the option can be exercised
     - Risk-free Rate (r): Annual risk-free interest rate (decimal)
     - Volatility (σ): Annual volatility of the stock (decimal)
     - Time to Maturity (T): Time until option expiration in years
     - Option Type: Call or Put
     - Number of Trials: More trials increase accuracy but take longer

2. **Interpreting Results**:
   - **Option Price**: Estimated fair value of the option
   - **Analytical Price**: Exact price calculated using the Black-Scholes formula
   - **Standard Error**: Measure of estimation accuracy
   - **Confidence Interval**: 95% confidence range for the true option price
   - **Price Distribution**: Histogram showing the distribution of simulated prices


## Future Enhancements
- Adding Dark Mode
- Adding C++ V/S JavaScript Performance Benchmark
- Add support for American options
- Implement more exotic option types (Asian, Barrier, etc.)
- Add more visualization features (stock price paths, etc.)
- Save simulation results to a database
- Add GPU acceleration for even faster Monte Carlo simulations

# Monte Carlo Simulation Suite

**Link**: https://montecarlosuitefe.onrender.com/

A web application for pricing options using Monte Carlo simulation with the Black-Scholes model.

## Features

- Price European options using Monte Carlo simulation
- Visualize option prices with confidence intervals
- Adjust all Black-Scholes parameters (stock price, strike price, volatility, etc.)
- Support for both call and put options
- **High-performance C++ backend** with JavaScript fallback
- **Dark Mode** with system preference detection and toggle

## User Interface

- Clean, modern interface with responsive design
- Intuitive parameter input forms
- Interactive charts and visualizations
- Performance benchmarking tools
- Dark/Light theme toggle with persistent user preference

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

The application has two backend implementations:

1. **C++ Implementation**: 
   - Uses multi-threading for parallel computation
   - Significantly faster for large number of trials
   - Automatically used if available

2. **JavaScript Implementation**:
   - Used as fallback if C++ implementation is not available
   - Simpler but slower for large simulations

### Dark Mode Implementation

The application features a modern dark mode implementation:
- True deep black (#000000) background for OLED screens
- High contrast text for readability
- Custom Chart.js theme integration for visualizations
- Persists user preference in local storage
- Auto-detects system preference on first visit

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

#### `POST /api/benchmark`

Benchmarks the performance of C++ vs JavaScript implementations.

**Request Body:**
Same format as `/api/blackscholes`

**Response:**
```json
{
  "javascript": {
    "runs": [...],            // Array of individual run results
    "statistics": {
      "avg": 325.5,           // Average execution time (ms)
      "min": 315.2,           // Minimum execution time (ms)
      "max": 335.8            // Maximum execution time (ms)
    }
  },
  "cpp": {
    "1": {                    // Results for 1 thread
      "runs": [...],
      "statistics": {...}
    },
    "2": {                    // Results for 2 threads
      "runs": [...],
      "statistics": {...}
    },
    // ... results for additional thread counts
  }
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
│       └── ThemeContext.js  # Dark mode context
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

### JavaScript Implementation

The JavaScript implementation mirrors the C++ implementation for consistent API, but without threading:

- Uses the Box-Muller transform for generating normal random variables
- Implements the same mathematical models for consistency
- Serves as a fallback when the C++ implementation is unavailable

### Adding New Option Models

To add a new option pricing model:

1. Create a new C++ class that inherits from `Simulation`
2. Implement the required virtual methods
3. Add corresponding JavaScript implementation
4. Create a new API endpoint in the Express server
5. Add a new form component in the React frontend

## Code Documentation Standards

### C++ Code Standards

- Class and method names use `PascalCase`
- Variables use `camelCase`
- Constants and macros use `UPPER_CASE`
- All public methods and classes have descriptive comments
- Implementation details are documented for complex algorithms

Example:

```cpp
/**
 * Calculates the option price using Monte Carlo simulation.
 * 
 * @param numTrials Number of Monte Carlo trials to run
 * @param numThreads Number of threads to utilize (0 for auto-detection)
 * @return The estimated option price
 */
double BlackScholesSimulation::calculateOptionPrice(int numTrials, int numThreads) {
    // Implementation details
}
```

### JavaScript/React Code Standards

- ES6+ syntax
- React hooks for state management
- JSDoc comments for functions and components

Example:

```javascript
/**
 * BlackScholes component for option pricing simulation.
 * Provides a form for parameter input and displays results.
 * 
 * @returns {JSX.Element} The rendered component
 */
function BlackScholes() {
    // Component implementation
}
```

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

### Performance Benchmark

1. **Running a Benchmark**:
   - Navigate to the Performance Benchmark tab
   - Enter the same parameters as in the option simulator
   - Click "Run Benchmark"

2. **Interpreting Benchmark Results**:
   - **Execution Time Comparison**: Chart comparing JavaScript vs C++ performance
   - **Thread Scaling**: Chart showing C++ performance across different thread counts
   - **Speedup Ratio**: How much faster C++ is compared to JavaScript
   - **Detailed Results Table**: Performance metrics for each configuration

### Using Dark Mode

- Toggle between light and dark mode using the sun/moon icon in the header
- Your preference will be saved for future visits
- The application will initially match your system preference

## Future Enhancements

- Add support for American options
- Implement more exotic option types (Asian, Barrier, etc.)
- Add more visualization features (stock price paths, etc.)
- Save simulation results to a database
- Add GPU acceleration for even faster Monte Carlo simulations

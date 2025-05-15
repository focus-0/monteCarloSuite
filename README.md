# Monte Carlo Simulation Suite

A web application for pricing options using Monte Carlo simulation with the Black-Scholes model.

## Features

- Price European options using Monte Carlo simulation
- Visualize option prices with confidence intervals
- Adjust all Black-Scholes parameters (stock price, strike price, volatility, etc.)
- Support for both call and put options

## Technologies Used

- **MongoDB**: Database (not currently used in this version)
- **Express.js**: Backend framework
- **React**: Frontend library
- **Node.js**: JavaScript runtime
- **Chart.js**: For data visualization

## Setup Instructions

### Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)

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

The server will run on port 5000, and the client will run on port 3000.

## How It Works

The application uses Monte Carlo simulation to price European options:

1. Generates random stock price paths based on Geometric Brownian Motion
2. Calculates option payoffs at maturity for each path
3. Averages the payoffs and discounts to present value
4. Provides a 95% confidence interval for the option price

## Future Enhancements

- Add support for American options
- Implement more exotic option types (Asian, Barrier, etc.)
- Add more visualization features (stock price paths, etc.)
- Save simulation results to a database
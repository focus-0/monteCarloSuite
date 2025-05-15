const express = require('express');
const cors = require('cors');
const routes = require('./src/routes');
const monteCarloService = require('./utils/monte_carlo_service');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use(routes);

// Start server
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  
  // Log which implementation is available
  const status = monteCarloService.getImplementationStatus();
  if (status.cpp_available) {
    console.log('C++ implementation for Monte Carlo simulation is available');
  } else {
    console.log('C++ implementation not found, will use JavaScript implementation');
    console.log('To enable C++ implementation, run: cd server/cpp && ./build.sh');
  }
}); 
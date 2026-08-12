require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const xss = require('xss-clean');
const mongoSanitize = require('express-mongo-sanitize');
const config = require('./config');
const routes = require('./src/routes');
const monteCarloService = require('./utils/monte_carlo_service');
const connectDB = require('./config/db');

// Connect to MongoDB
connectDB();

const app = express();

// Security middleware
// Set security headers
app.use(helmet());

// Rate limiting - relaxed for high-frequency simulation runs and benchmarks
const apiLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.nodeEnv === 'production' ? config.rateLimit.maxProduction : config.rateLimit.maxDevelopment,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests from this IP, please try again after 15 minutes' }
});

// Apply rate limiting to all routes
app.use('/api/', apiLimiter);

// Body parser
app.use(express.json({ limit: config.bodyLimit }));


// CORS configuration
app.use(cors({
  origin: config.nodeEnv === 'production' ? config.corsOrigins : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Routes
app.use(routes);

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    status: 'error',
    message: config.nodeEnv === 'development' ? err.message : 'Something went wrong'
  });
});

// Serve React client when a production build is present (Docker / unified deployment)
const clientBuildPath = config.clientBuildPath
  ? path.resolve(config.clientBuildPath)
  : path.join(__dirname, '..', 'client', 'build');
const clientIndexPath = path.join(clientBuildPath, 'index.html');

if (fs.existsSync(clientIndexPath)) {
  app.use(express.static(clientBuildPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(clientIndexPath);
  });
  console.log(`Serving React client from ${clientBuildPath}`);
} else {
  app.get('/', (req, res) => {
    res.send('Monte Carlo Suite API is live 🚀');
  });
}

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'Endpoint not found'
  });
});

// Start server
app.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
  
  // Log which implementation is available
  const status = monteCarloService.getImplementationStatus();
  if (status.cpp_available) {
    console.log('C++ implementation for Monte Carlo simulation is available');
  } else {
    console.log('C++ implementation not found, will use JavaScript implementation');
    console.log('To enable C++ implementation, run: cd server/cpp && ./build.sh');
  }
}); 
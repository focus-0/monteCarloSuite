require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const config = require('./config');
const routes = require('./src/routes');
const monteCarloService = require('./utils/monte_carlo_service');
const connectDB = require('./config/db');

// Connect to MongoDB
connectDB();

const app = express();

// Trust reverse proxy headers (Render, Heroku, Cloudflare, AWS ELB)
app.set('trust proxy', true);

// Security middleware (relaxed CSP for React SPA inline scripts and fonts)
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  })
);

// Body parser
app.use(express.json({ limit: config.bodyLimit }));

// MongoDB sanitize middleware
app.use(mongoSanitize());

// CORS configuration (allow all origins for seamless client + API access)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// API Routes
app.use(routes);

// Global error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err.stack || err.message);
  res.status(500).json({
    status: 'error',
    message: config.nodeEnv === 'development' ? err.message : 'Internal Server Error'
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
    res.send('Monte Carlo Suite API is live');
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
    console.log('C++ implementation for Monte Carlo simulation is available (Node-API In-Process)');
  } else {
    console.log('C++ implementation not found, will use JavaScript implementation');
  }
});
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const xss = require('xss-clean');
const mongoSanitize = require('express-mongo-sanitize');
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
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 1000 : 10000, // 10,000 requests per 15 mins for local testing
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests from this IP, please try again after 15 minutes' }
});

// Apply rate limiting to all routes
app.use('/api/', apiLimiter);

// Body parser
app.use(express.json({ limit: '10kb' })); // Body limit is 10kb


// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? 
    ['http://localhost:3000', 'https://montecarlosuitefe.onrender.com'] : '*',
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
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

app.get("/", (req, res) => {
  res.send("Monte Carlo Suite API is live 🚀");
});


// 404 handler
app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'Endpoint not found'
  });
});

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
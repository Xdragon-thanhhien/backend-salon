'use strict';

const express       = require('express');
const mongoose      = require('mongoose');
const session       = require('express-session');
const cookieParser  = require('cookie-parser');
const cors          = require('cors');
const helmet        = require('helmet');
const morgan        = require('morgan');
const path          = require('path');
require('dotenv').config();


// ─── Route Imports ────────────────────────────────────────────────────────────

const signupRouter = require('./routes/signup.routes');
const signinRouter = require('./routes/signin.routes');

// ─── Placeholder Dashboard Routes (extend later) ─────────────────────────────

const customerRouter = require('./routes/customer.routes'); // placeholder
const barberRouter   = require('./routes/barber.routes');   // placeholder
const adminRouter    = require('./routes/admin.routes');     // placeholder

// ─── Auth Middleware ──────────────────────────────────────────────────────────

const { authenticate, authorize } = require('./middlewares/auth.middleware');

// ─── App Initialization ───────────────────────────────────────────────────────

const app  = express();
const BASE_PORT = Number(process.env.PORT) || 3000;

// ─── Database Connection ──────────────────────────────────────────────────────

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser:    true,
      useUnifiedTopology: true
    });
    console.log('[DB] MongoDB connected successfully.');
  } catch (err) {
    console.error('[DB] Connection failed:', err.message);
    process.exit(1); // Exit if DB connection fails
  }
};

// ─── Security Middleware ──────────────────────────────────────────────────────

app.use(helmet());                     // Sets secure HTTP headers
app.use(cors({
  origin:      process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true                    // Allow cookies with CORS
}));

// ─── General Middleware ───────────────────────────────────────────────────────

app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json());               // Parse JSON request bodies
app.use(express.urlencoded({ extended: true })); // Parse form-encoded bodies
app.use(cookieParser());               // Parse cookies (needed for refresh token)

// ─── Session Middleware ───────────────────────────────────────────────────────
// Used for session-based auth (fallback or SSR views)
// If you go full JWT, you can remove this block

app.use(session({
  secret:            process.env.SESSION_SECRET || 'barbershop_secret_key',
  resave:            false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    maxAge:   7 * 24 * 60 * 60 * 1000 // 7 days
  }
}));

// ─── Static Files ─────────────────────────────────────────────────────────────

app.use(express.static(path.join(__dirname, 'public')));

// ─── View Engine (optional — remove if building REST API only) ────────────────

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ─── Health Check ─────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.status(200).json({
    status:    'OK',
    app:       'Barbershop App',
    timestamp: new Date().toISOString()
  });
});
/////
const authRoutes = require('./routes/auth.routes');
app.use('/api/v1/auth', authRoutes);


// ─── Auth Routes (Public) ─────────────────────────────────────────────────────

app.use('/api/v1/signup', signupRouter);
app.use('/api/v1/signin', signinRouter);

// ─── Protected Routes ─────────────────────────────────────────────────────────

// Customer routes – any authenticated user
app.use('/api/v1/customer', authenticate, authorize(['customer']), customerRouter);

// Barber routes – barber and admin only
app.use('/api/v1/barber', authenticate, authorize(['barber', 'admin']), barberRouter);

// Admin routes – admin only
app.use('/api/v1/admin', authenticate, authorize(['admin']), adminRouter);

// ─── 404 Handler ──────────────────────────────────────────────────────────────

app.use((req, res, next) => {
  res.status(404).json({
    status:  'error',
    message: `Route ${req.originalUrl} not found.`
  });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────

app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message    = err.message    || 'Internal Server Error';
  
  if (process.env.NODE_ENV !== 'production') {
    console.error('[ERROR]', err.stack);
  }
  
  res.status(statusCode).json({
    status:  'error',
    message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
});

// ─── Bootstrap ────────────────────────────────────────────────────────────────

const startServer = (port) => {
  const server = app.listen(port, () => {
    console.log(`[APP] Barbershop server running on http://localhost:${port}`);
    console.log(`[APP] Environment: ${process.env.NODE_ENV || 'development'}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      const nextPort = port + 1;
      console.warn(`[APP] Port ${port} is in use, retrying on ${nextPort}...`);
      startServer(nextPort);
      return;
    }

    console.error('[APP] Server failed to start:', err.message);
    process.exit(1);
  });
};

const bootstrap = async () => {
  await connectDB();
  startServer(BASE_PORT);
};

bootstrap();

module.exports = app; // Export for testing

// const express = require('express');
// const cors = require('cors');
// const dotenv = require('dotenv');
// const helmet = require('helmet');
// const morgan = require('morgan');

// // Load environment variables
// dotenv.config();

// const app = express();

// // Middleware
// app.use(helmet());
// app.use(morgan('combined'));
// app.use(cors());
// app.use(express.json());
// app.use(express.urlencoded({ extended: true }));

// // Routes
// app.get('/api/health', (req, res) => {
//     res.json({ status: 'Server is running' });
// });

// // API Routes
// app.use('/api/services', require('./routes/services'));
// app.use('/api/appointments', require('./routes/appointments'));
// app.use('/api/users', require('./routes/users'));

// // Error handling middleware
// app.use((err, req, res, next) => {
//     console.error(err.stack);
//     res.status(err.status || 500).json({
//         message: err.message || 'Internal Server Error',
//         status: err.status || 500
//     });
// });

// // 404 Handler
// app.use((req, res) => {
//     res.status(404).json({ message: 'Route not found' });
// });

// // Start server
// const PORT = process.env.PORT || 5000;
// app.listen(PORT, () => {
//     console.log(`Server running on port ${PORT}`);
// });

// module.exports = app;
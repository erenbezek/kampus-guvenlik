const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const swaggerUi = require('swagger-ui-express');

const authRoutes = require('./routes/auth');
const deviceRoutes = require('./routes/devices');
const sensorRoutes = require('./routes/sensors');
const alarmRoutes = require('./routes/alarms');
const adminRoutes = require('./routes/admin');
const Zone = require('./models/Zone');
const { RESTRICTED_ZONES } = require('./constants');
const swaggerSpec = require('./config/swagger');

const app = express();

app.use(cors({
  origin: (origin, callback) => {
    const allowed = [process.env.CLIENT_URL || 'http://localhost:5173'];
    // Allow mobile apps (no origin) and configured origins
    if (!origin || allowed.includes(origin)) return callback(null, true);
    callback(null, true); // Allow all for mobile Expo dev
  },
  credentials: true
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// Swagger UI — http://localhost:3001/api/docs
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'Campus Safety API Docs',
  customCss: '.swagger-ui .topbar { background-color: #1e293b; }',
  swaggerOptions: { persistAuthorization: true }
}));

// Raw OpenAPI spec
app.get('/api/docs.json', (_req, res) => res.json(swaggerSpec));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } });
});

// Zones endpoint — her zaman BTU yerleşke sınırları + admin DB zone'ları birlikte
app.get('/api/zones', async (_req, res) => {
  try {
    const dbZones = await Zone.find().sort({ createdAt: -1 });
    res.json({ success: true, data: [...RESTRICTED_ZONES, ...dbZones] });
  } catch {
    res.json({ success: true, data: RESTRICTED_ZONES });
  }
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/sensors', sensorRoutes);
app.use('/api/alarms', alarmRoutes);
app.use('/api/admin', adminRoutes);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// Global error handler
app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  res.status(status).json({ success: false, error: err.message || 'Internal server error' });
});

module.exports = app;

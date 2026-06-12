const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');

const authRoutes = require('./routes/auth');
const deviceRoutes = require('./routes/devices');
const sensorRoutes = require('./routes/sensors');
const alarmRoutes = require('./routes/alarms');
const adminRoutes = require('./routes/admin');
const Zone = require('./models/Zone');
const { RESTRICTED_ZONES } = require('./constants');
const { authenticate } = require('./middleware/auth');
const swaggerSpec = require('./config/swagger');

const app = express();

const IS_DEV = process.env.NODE_ENV !== 'production';
const ALLOWED_ORIGINS = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// Render reverse proxy arkasında çalışıyor — express-rate-limit'in gerçek
// istemci IP'sini görmesi için gerekli
app.set('trust proxy', 1);

app.use(cors({
  origin: (origin, callback) => {
    // Mobil istemciler origin göndermez → izin ver
    if (!origin) return callback(null, true);
    // Dev modda Expo / localhost her porttan çalışabilir
    if (IS_DEV) return callback(null, true);
    // Production: sadece allowlist
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: ${origin} engellendi`));
  },
  credentials: true
}));

// Güvenlik başlıkları (Swagger UI için contentSecurityPolicy kapalı)
app.use(helmet({ contentSecurityPolicy: false }));

// Auth rotalarına rate limiting (15 dk içinde 20 istek)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Çok fazla istek gönderildi, lütfen 15 dakika sonra tekrar deneyin.' }
});

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

if (IS_DEV) {
  app.use(morgan('dev'));
}

// Swagger UI — http://localhost:3001/api/docs
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'Campus Safety API Docs',
  customCss: '.swagger-ui .topbar { background-color: #1e293b; }',
  swaggerOptions: { persistAuthorization: true }
}));

app.get('/api/docs.json', (_req, res) => res.json(swaggerSpec));

app.get('/api/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } });
});

// Zones endpoint — auth korumalı, DB zone'ları + sabit zone'lar
app.get('/api/zones', authenticate, async (_req, res) => {
  try {
    const dbZones = await Zone.find().sort({ createdAt: -1 });
    res.json({ success: true, data: [...RESTRICTED_ZONES, ...dbZones] });
  } catch {
    res.json({ success: true, data: RESTRICTED_ZONES });
  }
});

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/sensors', sensorRoutes);
app.use('/api/alarms', alarmRoutes);
app.use('/api/admin', adminRoutes);

app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  res.status(status).json({ success: false, error: err.message || 'Internal server error' });
});

module.exports = app;

require('dotenv').config();

// ISP bazı ağlarda MongoDB Atlas SRV sorgularını bloklayabilir.
// USE_CUSTOM_DNS=true olunca Google DNS kullanılır.
if (process.env.USE_CUSTOM_DNS === 'true') {
  const dns = require('dns');
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
}

const http = require('http');
const { Server } = require('socket.io');

const app = require('./app');
const connectDB = require('./config/database');
const socketHandler = require('./socket/socketHandler');
const notification = require('./services/notificationService');
const { checkOfflineDevices } = require('./services/anomalyDetector');
const { startSimulator } = require('./services/sensorSimulator');
const logger = require('./utils/logger');
const runSeed = require('./scripts/seedData');

const PORT = process.env.PORT || 3001;
const IS_DEV = process.env.NODE_ENV !== 'production';

async function getMongoUri() {
  const mongoose = require('mongoose');
  const configuredUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/campus_safety';

  try {
    await mongoose.connect(configuredUri, { serverSelectionTimeoutMS: 5000 });
    await mongoose.disconnect();
    logger.info(`MongoDB bağlantısı başarılı: ${configuredUri.replace(/:\/\/.*@/, '://***@')}`);
    return configuredUri;
  } catch (err) {
    logger.warn(`MongoDB bağlantısı başarısız (${err.message})`);
  }

  if (IS_DEV) {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    logger.warn('Kalıcı MongoDB bulunamadı — geçici bellek-içi DB başlatılıyor...');
    const mongod = new MongoMemoryServer({ instance: { dbName: 'campus_safety' } });
    await mongod.start();
    const uri = mongod.getUri();
    logger.info(`In-memory MongoDB başlatıldı: ${uri}`);
    logger.warn('NOT: Veriler yeniden başlatmada KAYBOLUR. Atlas bağlantısını kontrol edin.');
    global.__mongoMemoryServer = mongod;
    process.on('exit', () => mongod.stop());
    return uri;
  }

  throw new Error('MongoDB bağlantısı kurulamadı. .env dosyasındaki MONGODB_URI adresini kontrol edin.');
}

async function start() {
  const mongoUri = await getMongoUri();
  process.env.MONGODB_URI = mongoUri;

  await connectDB();
  await runSeed();

  const server = http.createServer(app);

  const io = new Server(server, {
    cors: {
      origin: IS_DEV ? '*' : (process.env.CLIENT_URL || 'http://localhost:5173'),
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  socketHandler(io);
  notification.init(io);

  // Yapay sensör verisi — sadece ENABLE_FAKE_SENSORS=true ise çalışır
  if (process.env.ENABLE_FAKE_SENSORS === 'true') {
    startSimulator(5000);
    logger.info('Sensör simülatörü başlatıldı (BTU- cihazları, 5s interval)');
  }

  setInterval(async () => {
    const offlineAlarms = await checkOfflineDevices();
    for (const alarm of offlineAlarms) {
      notification.sendAlarmNotification(alarm);
      notification.sendDeviceStatusChange(alarm.deviceId, 'inactive');
    }
  }, 60 * 1000);

  server.listen(PORT, () => {
    logger.info(`Backend  → http://localhost:${PORT}`);
    logger.info(`API Docs → http://localhost:${PORT}/api/docs`);
    logger.info(`Health   → http://localhost:${PORT}/api/health`);
  });

  process.on('SIGTERM', () => {
    logger.warn('SIGTERM received, shutting down gracefully');
    server.close(() => process.exit(0));
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

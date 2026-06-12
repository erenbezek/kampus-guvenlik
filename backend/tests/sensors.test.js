const request = require('supertest');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const User = require('../src/models/User');
const Device = require('../src/models/Device');
const SensorData = require('../src/models/SensorData');
const { connect, disconnect, clearDatabase } = require('./setup');

process.env.JWT_SECRET = 'test-jwt-secret-key';
process.env.JWT_EXPIRES_IN = '1h';

let adminUser;
let adminToken;
let testDevice;

const SAFE_SENSOR_PAYLOAD = {
  sensors: {
    audioLevel: 50,
    gps: { lat: 40.0, lng: 29.0 },
    accelerometer: { x: 0.1, y: 0.2, z: 9.8 }
  },
  timestamp: new Date().toISOString()
};

beforeAll(async () => {
  await connect();
});

afterAll(async () => {
  await disconnect();
});

beforeEach(async () => {
  await clearDatabase();

  const passwordHash = await bcrypt.hash('adminpass', 4);
  adminUser = await User.create({
    username: 'sensoradmin',
    email: 'sensoradmin@kampus.edu.tr',
    passwordHash,
    role: 'admin'
  });
  adminToken = jwt.sign({ userId: adminUser._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

  testDevice = await Device.create({
    deviceId: 'sensor-test-device-001',
    name: 'Test Sensör Cihazı',
    owner: adminUser._id
  });
});

describe('POST /api/sensors/data — geçerli veri gönderme', () => {
  it('geçerli sensör verisi gönderme 201 döner', async () => {
    const res = await request(app)
      .post('/api/sensors/data')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ deviceId: testDevice.deviceId, ...SAFE_SENSOR_PAYLOAD });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.sensorData).toBeDefined();
    expect(res.body.data.riskScore).toBeDefined();
    expect(typeof res.body.data.riskScore).toBe('number');
    expect(res.body.data.alarms).toBeDefined();
    expect(Array.isArray(res.body.data.alarms)).toBe(true);
  });

  it('gönderilen veri veritabanına kaydedilir', async () => {
    await request(app)
      .post('/api/sensors/data')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ deviceId: testDevice.deviceId, ...SAFE_SENSOR_PAYLOAD });

    const saved = await SensorData.findOne({ deviceId: testDevice._id });
    expect(saved).not.toBeNull();
    expect(saved.sensors.audioLevel).toBe(50);
  });

  it('timestamp parametresi ile veri gönderme', async () => {
    const ts = '2025-06-01T10:00:00.000Z';
    const res = await request(app)
      .post('/api/sensors/data')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        deviceId: testDevice.deviceId,
        sensors: { audioLevel: 45, gps: { lat: 40.0, lng: 29.0 } },
        timestamp: ts
      });

    expect(res.statusCode).toBe(201);
    expect(new Date(res.body.data.sensorData.timestamp).toISOString()).toBe(ts);
  });

  it('minimum geçerli audioLevel (0) kabul edilir', async () => {
    const res = await request(app)
      .post('/api/sensors/data')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        deviceId: testDevice.deviceId,
        sensors: { audioLevel: 0 }
      });

    expect(res.statusCode).toBe(201);
  });

  it('maksimum geçerli audioLevel (130) kabul edilir', async () => {
    const res = await request(app)
      .post('/api/sensors/data')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        deviceId: testDevice.deviceId,
        sensors: { audioLevel: 130 }
      });

    expect(res.statusCode).toBe(201);
  });
});

describe('POST /api/sensors/data — hata durumları', () => {
  it('kayıtlı olmayan deviceId 404 döner', async () => {
    const res = await request(app)
      .post('/api/sensors/data')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        deviceId: 'var-olmayan-cihaz',
        sensors: { audioLevel: 50 }
      });

    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/not registered/i);
  });

  it('eksik audioLevel field 400 döner', async () => {
    const res = await request(app)
      .post('/api/sensors/data')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        deviceId: testDevice.deviceId,
        sensors: { gps: { lat: 40.0, lng: 29.0 } }
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('audioLevel 130 üzerinde 400 döner', async () => {
    const res = await request(app)
      .post('/api/sensors/data')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        deviceId: testDevice.deviceId,
        sensors: { audioLevel: 131 }
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/audioLevel/i);
  });

  it('audioLevel negatif değer 400 döner', async () => {
    const res = await request(app)
      .post('/api/sensors/data')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        deviceId: testDevice.deviceId,
        sensors: { audioLevel: -5 }
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('sensors field eksik 400 döner', async () => {
    const res = await request(app)
      .post('/api/sensors/data')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ deviceId: testDevice.deviceId });

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('geçersiz enlem değeri 400 döner', async () => {
    const res = await request(app)
      .post('/api/sensors/data')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        deviceId: testDevice.deviceId,
        sensors: { audioLevel: 50, gps: { lat: 200, lng: 29.0 } }
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('token olmadan istek 401 döner', async () => {
    const res = await request(app)
      .post('/api/sensors/data')
      .send({
        deviceId: testDevice.deviceId,
        sensors: { audioLevel: 50 }
      });

    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
  });
});

describe('GET /api/sensors/data — veri sorgulama', () => {
  beforeEach(async () => {
    await SensorData.create({
      deviceId: testDevice._id,
      sensors: { audioLevel: 55, gps: { lat: 40.0, lng: 29.0 } },
      riskScore: 15
    });
    await SensorData.create({
      deviceId: testDevice._id,
      sensors: { audioLevel: 60 },
      riskScore: 16
    });
  });

  it('sensör verilerini listeleme 200 döner', async () => {
    const res = await request(app)
      .get('/api/sensors/data')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(2);
  });

  it('deviceId filtresi ile sorgulama', async () => {
    const res = await request(app)
      .get(`/api/sensors/data?deviceId=${testDevice.deviceId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.length).toBe(2);
  });
});

describe('GET /api/sensors/latest/:deviceId', () => {
  it('son sensör verisini getirir', async () => {
    await SensorData.create({
      deviceId: testDevice._id,
      sensors: { audioLevel: 70 },
      riskScore: 20
    });

    const res = await request(app)
      .get(`/api/sensors/latest/${testDevice.deviceId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.sensors.audioLevel).toBe(70);
  });

  it('kayıtlı olmayan cihaz için 404 döner', async () => {
    const res = await request(app)
      .get('/api/sensors/latest/olmayan-cihaz')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

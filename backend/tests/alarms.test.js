const request = require('supertest');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const User = require('../src/models/User');
const Device = require('../src/models/Device');
const Alarm = require('../src/models/Alarm');
const { connect, disconnect, clearDatabase } = require('./setup');

process.env.JWT_SECRET = 'test-jwt-secret-key';
process.env.JWT_EXPIRES_IN = '1h';

let adminUser;
let adminToken;
let operatorUser;
let operatorToken;
let viewerUser;
let viewerToken;
let testDevice;

beforeAll(async () => {
  await connect();
});

afterAll(async () => {
  await disconnect();
});

beforeEach(async () => {
  await clearDatabase();

  const adminHash = await bcrypt.hash('adminpass', 4);
  adminUser = await User.create({
    username: 'alarmadmin',
    email: 'alarmadmin@kampus.edu.tr',
    passwordHash: adminHash,
    role: 'admin'
  });
  adminToken = jwt.sign({ userId: adminUser._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

  const operatorHash = await bcrypt.hash('oppass', 4);
  operatorUser = await User.create({
    username: 'operator',
    email: 'operator@kampus.edu.tr',
    passwordHash: operatorHash,
    role: 'operator'
  });
  operatorToken = jwt.sign({ userId: operatorUser._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

  const viewerHash = await bcrypt.hash('viewpass', 4);
  viewerUser = await User.create({
    username: 'viewer2',
    email: 'viewer2@kampus.edu.tr',
    passwordHash: viewerHash,
    role: 'viewer'
  });
  viewerToken = jwt.sign({ userId: viewerUser._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

  testDevice = await Device.create({
    deviceId: 'alarm-test-device',
    name: 'Alarm Test Cihazı',
    owner: adminUser._id
  });
});

describe('GET /api/alarms — alarm listeleme', () => {
  beforeEach(async () => {
    await Alarm.create({
      deviceId: testDevice._id,
      type: 'NOISE_ANOMALY',
      severity: 'high',
      message: 'Yüksek gürültü tespit edildi'
    });
    await Alarm.create({
      deviceId: testDevice._id,
      type: 'UNUSUAL_MOVEMENT',
      severity: 'medium',
      message: 'Olağandışı hareket tespit edildi',
      resolved: true,
      resolvedBy: adminUser._id,
      resolvedAt: new Date()
    });
  });

  it('alarmlar listelenir 200 ve array döner', async () => {
    const res = await request(app)
      .get('/api/alarms')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(2);
  });

  it('çözülmemiş alarmlar resolved=false filtresi ile listelenir', async () => {
    const res = await request(app)
      .get('/api/alarms?resolved=false')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].resolved).toBe(false);
  });

  it('çözülmüş alarmlar resolved=true filtresi ile listelenir', async () => {
    const res = await request(app)
      .get('/api/alarms?resolved=true')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].resolved).toBe(true);
  });

  it('severity filtresi ile listeleme', async () => {
    const res = await request(app)
      .get('/api/alarms?severity=high')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].severity).toBe('high');
  });

  it('type filtresi ile listeleme', async () => {
    const res = await request(app)
      .get('/api/alarms?type=NOISE_ANOMALY')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].type).toBe('NOISE_ANOMALY');
  });

  it('token olmadan listeleme 401 döner', async () => {
    const res = await request(app).get('/api/alarms');

    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('viewer kullanıcısı da alarmları görebilir', async () => {
    const res = await request(app)
      .get('/api/alarms')
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe('POST /api/alarms/:id/resolve — alarm çözme', () => {
  let activeAlarm;
  let resolvedAlarm;

  beforeEach(async () => {
    activeAlarm = await Alarm.create({
      deviceId: testDevice._id,
      type: 'NOISE_ANOMALY',
      severity: 'high',
      message: 'Çözülecek alarm'
    });

    resolvedAlarm = await Alarm.create({
      deviceId: testDevice._id,
      type: 'CROWD_DENSITY',
      severity: 'high',
      message: 'Zaten çözülmüş alarm',
      resolved: true,
      resolvedBy: adminUser._id,
      resolvedAt: new Date()
    });
  });

  it('admin aktif alarmı çözebilir — resolved=true olur', async () => {
    const res = await request(app)
      .post(`/api/alarms/${activeAlarm._id}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.resolved).toBe(true);
    expect(res.body.data.resolvedBy).toBeDefined();
    expect(res.body.data.resolvedAt).toBeDefined();
  });

  it('operatör aktif alarmı çözebilir', async () => {
    const res = await request(app)
      .post(`/api/alarms/${activeAlarm._id}/resolve`)
      .set('Authorization', `Bearer ${operatorToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.resolved).toBe(true);
  });

  it('çözüm sonrası veritabanında resolved=true', async () => {
    await request(app)
      .post(`/api/alarms/${activeAlarm._id}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`);

    const dbAlarm = await Alarm.findById(activeAlarm._id);
    expect(dbAlarm.resolved).toBe(true);
    expect(dbAlarm.resolvedBy.toString()).toBe(adminUser._id.toString());
  });

  it('zaten çözülmüş alarm tekrar çözme 400 döner', async () => {
    const res = await request(app)
      .post(`/api/alarms/${resolvedAlarm._id}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/already resolved/i);
  });

  it('viewer alarmı çözemez — 403 döner', async () => {
    const res = await request(app)
      .post(`/api/alarms/${activeAlarm._id}/resolve`)
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.statusCode).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('olmayan alarm için 404 döner', async () => {
    const fakeId = '64a1b2c3d4e5f6a7b8c9d0e1';
    const res = await request(app)
      .post(`/api/alarms/${fakeId}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('token olmadan çözme 401 döner', async () => {
    const res = await request(app)
      .post(`/api/alarms/${activeAlarm._id}/resolve`);

    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
  });
});

describe('GET /api/alarms/stats — alarm istatistikleri', () => {
  beforeEach(async () => {
    await Alarm.create({ deviceId: testDevice._id, type: 'NOISE_ANOMALY', severity: 'high', message: 'Gürültü 1' });
    await Alarm.create({ deviceId: testDevice._id, type: 'NOISE_ANOMALY', severity: 'high', message: 'Gürültü 2' });
    await Alarm.create({ deviceId: testDevice._id, type: 'CROWD_DENSITY', severity: 'medium', message: 'Kalabalık', resolved: true, resolvedBy: adminUser._id, resolvedAt: new Date() });
  });

  it('alarm istatistikleri 200 döner', async () => {
    const res = await request(app)
      .get('/api/alarms/stats')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.total).toBe(3);
    expect(res.body.data.unresolvedCount).toBe(2);
    expect(Array.isArray(res.body.data.bySeverity)).toBe(true);
    expect(Array.isArray(res.body.data.byType)).toBe(true);
  });
});

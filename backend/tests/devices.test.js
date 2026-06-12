const request = require('supertest');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const User = require('../src/models/User');
const Device = require('../src/models/Device');
const { connect, disconnect, clearDatabase } = require('./setup');

process.env.JWT_SECRET = 'test-jwt-secret-key';
process.env.JWT_EXPIRES_IN = '1h';

let adminUser;
let adminToken;
let viewerUser;
let viewerToken;

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
    username: 'admin',
    email: 'admin@kampus.edu.tr',
    passwordHash,
    role: 'admin'
  });
  adminToken = jwt.sign({ userId: adminUser._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

  const viewerHash = await bcrypt.hash('viewerpass', 4);
  viewerUser = await User.create({
    username: 'viewer',
    email: 'viewer@kampus.edu.tr',
    passwordHash: viewerHash,
    role: 'viewer'
  });
  viewerToken = jwt.sign({ userId: viewerUser._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
});

describe('GET /api/devices — token kontrolü', () => {
  it('token olmadan istek 401 döner', async () => {
    const res = await request(app).get('/api/devices');

    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('geçersiz token ile istek 401 döner', async () => {
    const res = await request(app)
      .get('/api/devices')
      .set('Authorization', 'Bearer yanlis.token.degeri');

    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
  });
});

describe('POST /api/devices — cihaz oluşturma', () => {
  it('geçerli token ile yeni cihaz oluşturma 201 döner', async () => {
    const res = await request(app)
      .post('/api/devices')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ deviceId: 'telefon-001', name: 'Öğrenci Telefonu 1' });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.deviceId).toBe('telefon-001');
    expect(res.body.data.name).toBe('Öğrenci Telefonu 1');
    expect(res.body.data.owner).toBeDefined();
  });

  it('konum bilgisiyle cihaz oluşturma', async () => {
    const res = await request(app)
      .post('/api/devices')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        deviceId: 'telefon-002',
        name: 'Kampüs Güvenlik Cihazı',
        location: { lat: 40.2165, lng: 29.083 }
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.data.location.lat).toBe(40.2165);
    expect(res.body.data.location.lng).toBe(29.083);
  });

  it('aynı deviceId ile tekrar kayıt 400 döner', async () => {
    await request(app)
      .post('/api/devices')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ deviceId: 'telefon-duplikat', name: 'İlk Telefon' });

    const res = await request(app)
      .post('/api/devices')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ deviceId: 'telefon-duplikat', name: 'İkinci Telefon' });

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/already registered/i);
  });

  it('deviceId eksik ise 400 döner', async () => {
    const res = await request(app)
      .post('/api/devices')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'İsimsiz Cihaz' });

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('name eksik ise 400 döner', async () => {
    const res = await request(app)
      .post('/api/devices')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ deviceId: 'cihaz-x' });

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe('GET /api/devices — cihaz listeleme', () => {
  beforeEach(async () => {
    await Device.create({ deviceId: 'admin-cihaz-1', name: 'Admin Cihazı', owner: adminUser._id });
    await Device.create({ deviceId: 'viewer-cihaz-1', name: 'Viewer Cihazı', owner: viewerUser._id });
  });

  it('admin tüm cihazları görür', async () => {
    const res = await request(app)
      .get('/api/devices')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(2);
  });

  it('viewer sadece kendi cihazlarını görür', async () => {
    const res = await request(app)
      .get('/api/devices')
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].deviceId).toBe('viewer-cihaz-1');
  });
});

describe('PUT /api/devices/:id — cihaz güncelleme', () => {
  let device;

  beforeEach(async () => {
    device = await Device.create({ deviceId: 'guncelcihaz', name: 'Eski İsim', owner: adminUser._id });
  });

  it('admin cihaz adını güncelleyebilir', async () => {
    const res = await request(app)
      .put(`/api/devices/${device._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Yeni İsim' });

    expect(res.statusCode).toBe(200);
    expect(res.body.data.name).toBe('Yeni İsim');
  });

  it('bulunamayan cihaz 404 döner', async () => {
    const fakeId = '64a1b2c3d4e5f6a7b8c9d0e1';
    const res = await request(app)
      .put(`/api/devices/${fakeId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Deneme' });

    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

describe('DELETE /api/devices/:id — cihaz silme', () => {
  let device;

  beforeEach(async () => {
    device = await Device.create({ deviceId: 'silinecek-cihaz', name: 'Silinecek', owner: adminUser._id });
  });

  it('admin cihazı silebilir', async () => {
    const res = await request(app)
      .delete(`/api/devices/${device._id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);

    const dbCheck = await Device.findById(device._id);
    expect(dbCheck).toBeNull();
  });

  it('viewer cihazı silemez — 403 döner', async () => {
    const res = await request(app)
      .delete(`/api/devices/${device._id}`)
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.statusCode).toBe(403);
    expect(res.body.success).toBe(false);
  });
});

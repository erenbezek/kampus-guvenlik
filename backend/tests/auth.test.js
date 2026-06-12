const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../src/app');
const User = require('../src/models/User');
const { connect, disconnect, clearDatabase } = require('./setup');

process.env.JWT_SECRET = 'test-jwt-secret-key';
process.env.JWT_EXPIRES_IN = '1h';

beforeAll(async () => {
  await connect();
});

afterAll(async () => {
  await disconnect();
});

beforeEach(async () => {
  await clearDatabase();
});

describe('POST /api/auth/register', () => {
  it('başarılı kayıt 201 döner ve token içerir', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'testkullanici',
        email: 'test@kampus.edu.tr',
        password: 'gizli123'
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(typeof res.body.data.token).toBe('string');
    expect(res.body.data.user.email).toBe('test@kampus.edu.tr');
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });

  it('duplicate email ile kayıt 400 döner', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ username: 'birinciuser', email: 'ortak@kampus.edu.tr', password: 'sifre123' });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'ikinciuser', email: 'ortak@kampus.edu.tr', password: 'sifre456' });

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/zaten kullanımda/i);
  });

  it('duplicate username ile kayıt 400 döner', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ username: 'ayniisim', email: 'ilk@kampus.edu.tr', password: 'sifre123' });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'ayniisim', email: 'ikinci@kampus.edu.tr', password: 'sifre456' });

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('geçersiz email formatı ile kayıt 400 döner', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'geçerliuser', email: 'gecersizimail', password: 'sifre123' });

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('çok kısa şifre ile kayıt 400 döner', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'user123', email: 'user@test.com', password: '123' });

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('admin rolü ile kayıt 403 döner (admin kaydı engellendi)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'adminuser',
        email: 'admin@kampus.edu.tr',
        password: 'adminpass123',
        role: 'admin'
      });

    expect(res.statusCode).toBe(403);
    expect(res.body.success).toBe(false);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    const passwordHash = await bcrypt.hash('dogrupassword', 4);
    await User.create({
      username: 'mevcutkullanici',
      email: 'mevcut@kampus.edu.tr',
      passwordHash,
      role: 'viewer'
    });
  });

  it('başarılı giriş 200 döner ve JWT token içerir', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'mevcut@kampus.edu.tr', password: 'dogrupassword' });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(typeof res.body.data.token).toBe('string');
    expect(res.body.data.user).toBeDefined();
  });

  it('yanlış şifre ile giriş 401 döner', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'mevcut@kampus.edu.tr', password: 'yanlipassword' });

    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/invalid/i);
  });

  it('kayıtlı olmayan email ile giriş 401 döner', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'yoktur@kampus.edu.tr', password: 'herhangipassword' });

    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('boş şifre ile giriş 400 döner', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'mevcut@kampus.edu.tr', password: '' });

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe('GET /api/auth/me', () => {
  it('geçerli token ile kullanıcı bilgisi döner', async () => {
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'benuserim',
        email: 'ben@kampus.edu.tr',
        password: 'sifrem123'
      });

    const token = regRes.body.data.token;

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toBe('ben@kampus.edu.tr');
  });

  it('token olmadan /me isteği 401 döner', async () => {
    const res = await request(app).get('/api/auth/me');

    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('geçersiz token ile /me isteği 401 döner', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer gecersiz.token.burada');

    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
  });
});

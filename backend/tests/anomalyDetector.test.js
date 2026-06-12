const mongoose = require('mongoose');
const { analyzeData, calculateRiskScore } = require('../src/services/anomalyDetector');
const Alarm = require('../src/models/Alarm');
const { connect, disconnect, clearDatabase } = require('./setup');

process.env.JWT_SECRET = 'test-jwt-secret-key';
process.env.JWT_EXPIRES_IN = '1h';

// Her test farklı bir deviceId kullanır — modül-seviyesi in-memory state'i sıfırlamadan izole eder
function freshDeviceId() {
  return new mongoose.Types.ObjectId();
}

beforeAll(async () => {
  await connect();
});

afterAll(async () => {
  await disconnect();
});

beforeEach(async () => {
  await clearDatabase();
});

// ─── calculateRiskScore (saf fonksiyon, DB gerektirmez) ───────────────────────

describe('calculateRiskScore — risk skoru hesaplama', () => {
  it('hiç sensör verisi yoksa 0 döner', () => {
    expect(calculateRiskScore({})).toBe(0);
  });

  it('audioLevel=0 ile risk skoru 0 döner', () => {
    expect(calculateRiskScore({ audioLevel: 0 })).toBe(0);
  });

  it('maksimum audioLevel (130dB) → ses bileşeni 35 puan', () => {
    // audioLevel tam ağırlık: 35 puan
    expect(calculateRiskScore({ audioLevel: 130 })).toBe(35);
  });

  it('orta audioLevel (65dB) → ses bileşeni ~17-18 puan', () => {
    // Math.min(65/130, 1) * 35 = 0.5 * 35 = 17.5 → Math.round = 18
    expect(calculateRiskScore({ audioLevel: 65 })).toBe(18);
  });

  it('yüksek ivme magnitude → hareket bileşeni tam puan ekler', () => {
    // magnitude = sqrt(30²) = 30 → Math.min(30/30,1)*30 = 30
    // audioLevel yok → 0
    // toplam = 30
    const sensors = { accelerometer: { x: 30, y: 0, z: 0 } };
    expect(calculateRiskScore(sensors)).toBe(30);
  });

  it('ses + ivme bileşeni doğru toplanır', () => {
    // audioLevel=65 → 17.5, accelerometer mag=30 → 30, toplam=47.5 → round=48
    const sensors = {
      audioLevel: 65,
      accelerometer: { x: 30, y: 0, z: 0 }
    };
    expect(calculateRiskScore(sensors)).toBe(48);
  });

  it('zayıf ağ sinyali (networkStrength=0) 10 puan ekler', () => {
    // (1 - 0/100) * 10 = 10
    expect(calculateRiskScore({ networkStrength: 0 })).toBe(10);
  });

  it('güçlü ağ sinyali (networkStrength=100) 0 puan ekler', () => {
    // (1 - 100/100) * 10 = 0
    expect(calculateRiskScore({ networkStrength: 100 })).toBe(0);
  });

  it('risk skoru 100 üzerine çıkmaz', () => {
    const sensors = {
      audioLevel: 130,
      accelerometer: { x: 100, y: 100, z: 100 },
      networkStrength: 0
    };
    expect(calculateRiskScore(sensors)).toBeLessThanOrEqual(100);
  });

  it('GPS kısıtlı bölgede değilse sıfır bölge puanı', () => {
    // Türkiye'nin ortası — kısıtlı bölgelerin çok uzağında
    const sensors = {
      audioLevel: 0,
      gps: { lat: 39.0, lng: 35.0 }
    };
    expect(calculateRiskScore(sensors)).toBe(0);
  });
});

// ─── analyzeData — gürültü analizi ──────────────────────────────────────────

describe('analyzeData — normal ses seviyesi', () => {
  it('düşük ses (50dB) tek okuma → alarm üretmez', async () => {
    const deviceId = freshDeviceId();
    const { alarms } = await analyzeData(deviceId, { audioLevel: 50 });

    expect(alarms).toHaveLength(0);
  });

  it('eşik altı ses (85dB) ile 5 ardışık okuma → alarm üretmez', async () => {
    const deviceId = freshDeviceId();
    let result;
    for (let i = 0; i < 5; i++) {
      result = await analyzeData(deviceId, { audioLevel: 84 });
    }
    const noiseAlarms = result.alarms.filter(a => a.type === 'NOISE_ANOMALY');
    expect(noiseAlarms).toHaveLength(0);
  });
});

describe('analyzeData — NOISE_ANOMALY alarm üretimi', () => {
  it('10 ardışık yüksek ses (>85dB) NOISE_ANOMALY alarmı üretir', async () => {
    const deviceId = freshDeviceId();
    let allAlarms = [];

    for (let i = 0; i < 10; i++) {
      const { alarms } = await analyzeData(deviceId, { audioLevel: 90 });
      allAlarms = allAlarms.concat(alarms);
    }

    const noiseAlarms = allAlarms.filter(a => a.type === 'NOISE_ANOMALY');
    expect(noiseAlarms.length).toBeGreaterThan(0);
    expect(noiseAlarms[0].severity).toBe('high');
    expect(noiseAlarms[0].message).toMatch(/noise/i);
  });

  it('10. okumada veritabanına alarm kaydedilir', async () => {
    const deviceId = freshDeviceId();

    for (let i = 0; i < 10; i++) {
      await analyzeData(deviceId, { audioLevel: 95 });
    }

    const dbAlarms = await Alarm.find({ deviceId, type: 'NOISE_ANOMALY' });
    expect(dbAlarms.length).toBeGreaterThan(0);
    expect(dbAlarms[0].resolved).toBe(false);
  });

  it('gürültü kesilince noiseBuffer sıfırlanır ve alarm üretilmez', async () => {
    const deviceId = freshDeviceId();

    // 9 yüksek okuma (alarm için yeterli değil)
    for (let i = 0; i < 9; i++) {
      await analyzeData(deviceId, { audioLevel: 90 });
    }

    // Düşük okuma → buffer sıfırlanır
    await analyzeData(deviceId, { audioLevel: 50 });

    // Tekrar 5 yüksek okuma — sayaç yeniden başladığı için alarm yok
    let result;
    for (let i = 0; i < 5; i++) {
      result = await analyzeData(deviceId, { audioLevel: 90 });
    }

    const noiseAlarms = result.alarms.filter(a => a.type === 'NOISE_ANOMALY');
    expect(noiseAlarms).toHaveLength(0);
  });
});

// ─── analyzeData — risk skoru entegrasyonu ──────────────────────────────────

describe('analyzeData — risk skoru', () => {
  it('düşük sesle risk skoru düşük gelir', async () => {
    const deviceId = freshDeviceId();
    const { riskScore } = await analyzeData(deviceId, { audioLevel: 20 });

    expect(riskScore).toBeLessThan(20);
  });

  it('yüksek sesle risk skoru yüksek gelir', async () => {
    const deviceId = freshDeviceId();
    const { riskScore: lowRisk } = await analyzeData(freshDeviceId(), { audioLevel: 10 });
    const { riskScore: highRisk } = await analyzeData(deviceId, { audioLevel: 120 });

    expect(highRisk).toBeGreaterThan(lowRisk);
  });

  it('analyzeData her zaman alarms array ve riskScore döner', async () => {
    const deviceId = freshDeviceId();
    const result = await analyzeData(deviceId, { audioLevel: 50 });

    expect(result).toHaveProperty('alarms');
    expect(result).toHaveProperty('riskScore');
    expect(Array.isArray(result.alarms)).toBe(true);
    expect(typeof result.riskScore).toBe('number');
  });
});

// ─── analyzeData — olağandışı hareket ───────────────────────────────────────

describe('analyzeData — hareket analizi', () => {
  it('normal ivme değerleri alarm üretmez', async () => {
    const deviceId = freshDeviceId();
    const { alarms } = await analyzeData(deviceId, {
      audioLevel: 40,
      accelerometer: { x: 0.1, y: 0.1, z: 1.0 }
    });

    const movAlarms = alarms.filter(a => a.type === 'UNUSUAL_MOVEMENT');
    expect(movAlarms).toHaveLength(0);
  });

  it('yüksek ivme 3 ardışık okumada UNUSUAL_MOVEMENT alarmı üretir', async () => {
    const deviceId = freshDeviceId();
    let allAlarms = [];

    for (let i = 0; i < 3; i++) {
      const { alarms } = await analyzeData(deviceId, {
        audioLevel: 50,
        accelerometer: { x: 25, y: 0, z: 0 }
      });
      allAlarms = allAlarms.concat(alarms);
    }

    const movAlarms = allAlarms.filter(a => a.type === 'UNUSUAL_MOVEMENT');
    expect(movAlarms.length).toBeGreaterThan(0);
    expect(movAlarms[0].severity).toBe('medium');
  });
});

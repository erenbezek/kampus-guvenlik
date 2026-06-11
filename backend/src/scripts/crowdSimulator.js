require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const SensorData = require('../models/SensorData');
const Device = require('../models/Device');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/campus_safety';

// Bu script, telefonunla aynı GPS konumunda 3 sahte cihaz verisi ekler.
// Böylece kalabalık alarmı tetiklenir.

async function simulate() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ MongoDB bağlandı');

  const devices = await Device.find().limit(3);
  if (devices.length === 0) {
    console.log('❌ Cihaz bulunamadı. Önce backend başlat.');
    process.exit(1);
  }

  // Telefon konumuna yakın GPS (50m içinde)
  const baseGps = { lat: 40.2167, lng: 29.0833 };

  for (let i = 0; i < devices.length; i++) {
    const sensorDoc = new SensorData({
      deviceId: devices[i]._id,
      timestamp: new Date(),
      sensors: {
        gps: {
          lat: baseGps.lat + (i * 0.0001),
          lng: baseGps.lng + (i * 0.0001),
        },
        audioLevel: 50 + i * 5,
        accelerometer: { x: 0.1, y: 0.2, z: 0.9 },
        networkStrength: 80,
      },
      riskScore: 20,
    });
    await sensorDoc.save();
    await Device.findByIdAndUpdate(devices[i]._id, { lastSeen: new Date(), status: 'active' });
    console.log(`📱 Cihaz ${devices[i].name} (${devices[i].deviceId}) konumu simüle edildi`);
  }

  console.log('\n🎉 Simülasyon tamamlandı!');
  console.log('Şimdi telefon 5 saniye içinde veri gönderince CROWD_DENSITY alarmı tetiklenecek.');
  process.exit(0);
}

simulate().catch(err => {
  console.error('Hata:', err.message);
  process.exit(1);
});

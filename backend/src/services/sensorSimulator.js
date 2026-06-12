'use strict';

const Device = require('../models/Device');
const SensorData = require('../models/SensorData');
const { analyzeData } = require('./anomalyDetector');
const notification = require('./notificationService');
const logger = require('../utils/logger');

const BTU_LAT = 40.18761378070147;
const BTU_LNG = 29.12915854897244;

function rand(min, max) { return min + Math.random() * (max - min); }

function makeSensors() {
  // Sabit kampüs merkezi etrafında jitter — random walk yapmaz, böylece
  // birden fazla simülatör örneği aynı anda çalışsa da konum kampüsten uzaklaşmaz
  const baseLat = BTU_LAT;
  const baseLng = BTU_LNG;
  const audioLevel = parseFloat(rand(38, 78).toFixed(1));
  const mag = rand(0.8, 1.6);
  const angle = Math.random() * 2 * Math.PI;
  return {
    audioLevel,
    accelerometer: {
      x: parseFloat((mag * Math.cos(angle)).toFixed(3)),
      y: parseFloat((mag * Math.sin(angle)).toFixed(3)),
      z: parseFloat(rand(0.85, 1.15).toFixed(3))
    },
    gyroscope: { x: 0, y: 0, z: 0 },
    gps: {
      lat: parseFloat((baseLat + rand(-0.0005, 0.0005)).toFixed(6)),
      lng: parseFloat((baseLng + rand(-0.0005, 0.0005)).toFixed(6)),
      accuracy: 5
    },
    networkStrength: Math.round(rand(65, 100))
  };
}

async function tick() {
  try {
    const devices = await Device.find({ deviceId: /^BTU-/ });
    for (const device of devices) {
      const sensors = makeSensors();
      const { alarms, riskScore } = await analyzeData(device._id, sensors);

      const sensorDoc = new SensorData({
        deviceId: device._id,
        timestamp: new Date(),
        sensors,
        riskScore
      });
      await sensorDoc.save();

      await Device.findByIdAndUpdate(device._id, {
        lastSeen: new Date(),
        status: 'active',
        location: { lat: sensors.gps.lat, lng: sensors.gps.lng }
      });

      notification.sendSensorUpdate({
        deviceId: device._id,
        deviceName: device.name,
        timestamp: sensorDoc.timestamp,
        sensors,
        riskScore
      });

      for (const alarm of alarms) {
        notification.sendAlarmNotification(alarm);
        notification.sendDeviceStatusChange(alarm.deviceId, 'active');
      }
    }
  } catch (err) {
    logger.error('Simulator tick error:', err.message);
  }
}

function startSimulator(intervalMs = 5000) {
  logger.info(`Yapay sensör simülatörü başladı — her ${intervalMs / 1000}s`);
  // İlk tick hemen çalışsın
  setTimeout(tick, 2000);
  setInterval(tick, intervalMs);
}

module.exports = { startSimulator };

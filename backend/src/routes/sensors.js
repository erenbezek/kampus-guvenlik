const express = require('express');
const router = express.Router();
const { body, query } = require('express-validator');
const SensorData = require('../models/SensorData');
const Device = require('../models/Device');
const { authenticate } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { analyzeData } = require('../services/anomalyDetector');
const notification = require('../services/notificationService');

router.use(authenticate);

// POST /api/sensors/data — mobile device posts sensor readings
router.post(
  '/data',
  [
    body('deviceId').notEmpty().withMessage('deviceId required'),
    body('sensors').isObject().withMessage('sensors object required'),
    body('sensors.audioLevel').isFloat({ min: 0, max: 130 }).withMessage('audioLevel 0-130'),
    body('sensors.gps.lat').optional().isFloat({ min: -90, max: 90 }),
    body('sensors.gps.lng').optional().isFloat({ min: -180, max: 180 })
  ],
  validate,
  async (req, res) => {
    try {
      const { deviceId, sensors, timestamp } = req.body;

      const device = await Device.findOne({ deviceId });
      if (!device) {
        return res.status(404).json({ success: false, error: 'Device not registered' });
      }

      // Run anomaly detection and compute risk score
      const { alarms, riskScore } = await analyzeData(device._id, sensors);

      // Persist sensor reading
      const sensorDoc = new SensorData({
        deviceId: device._id,
        timestamp: timestamp ? new Date(timestamp) : new Date(),
        sensors,
        riskScore
      });
      await sensorDoc.save();

      // Update device location and heartbeat
      await Device.findByIdAndUpdate(device._id, {
        lastSeen: new Date(),
        status: 'active',
        ...(sensors.gps?.lat != null && {
          location: { lat: sensors.gps.lat, lng: sensors.gps.lng }
        }),
        ...(req.body.batteryLevel != null && { batteryLevel: req.body.batteryLevel })
      });

      // Broadcast to dashboard via socket
      notification.sendSensorUpdate({
        deviceId: device._id,
        deviceName: device.name,
        timestamp: sensorDoc.timestamp,
        sensors,
        riskScore
      });

      // Broadcast each alarm
      for (const alarm of alarms) {
        notification.sendAlarmNotification(alarm);
      }

      return res.status(201).json({ success: true, data: { sensorData: sensorDoc, alarms, riskScore } });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'Failed to process sensor data' });
    }
  }
);

// GET /api/sensors/data?deviceId=&from=&to=&limit=
router.get(
  '/data',
  [
    query('limit').optional().isInt({ min: 1, max: 1000 }).toInt(),
    query('from').optional().isISO8601(),
    query('to').optional().isISO8601()
  ],
  validate,
  async (req, res) => {
    try {
      const { deviceId, from, to, limit = 100 } = req.query;

      const filter = {};
      if (deviceId) {
        const device = await Device.findOne({ deviceId });
        if (device) filter.deviceId = device._id;
      }
      if (from || to) {
        filter.timestamp = {};
        if (from) filter.timestamp.$gte = new Date(from);
        if (to) filter.timestamp.$lte = new Date(to);
      }

      const data = await SensorData.find(filter)
        .sort({ timestamp: -1 })
        .limit(Number(limit))
        .populate('deviceId', 'name deviceId');

      return res.json({ success: true, data });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'Failed to fetch sensor data' });
    }
  }
);

// GET /api/sensors/latest/:deviceId
router.get('/latest/:deviceId', async (req, res) => {
  try {
    const device = await Device.findOne({ deviceId: req.params.deviceId });
    if (!device) return res.status(404).json({ success: false, error: 'Device not found' });

    const latest = await SensorData.findOne({ deviceId: device._id }).sort({ timestamp: -1 });
    if (!latest) return res.status(404).json({ success: false, error: 'No sensor data found' });

    return res.json({ success: true, data: latest });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to fetch latest data' });
  }
});

// GET /api/sensors/stats/:deviceId
router.get('/stats/:deviceId', async (req, res) => {
  try {
    const device = await Device.findOne({ deviceId: req.params.deviceId });
    if (!device) return res.status(404).json({ success: false, error: 'Device not found' });

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [totalReadings, recentData] = await Promise.all([
      SensorData.countDocuments({ deviceId: device._id }),
      SensorData.find({ deviceId: device._id, timestamp: { $gte: oneDayAgo } })
        .select('sensors.audioLevel riskScore timestamp')
    ]);

    const avgAudio = recentData.length
      ? (recentData.reduce((s, d) => s + (d.sensors.audioLevel || 0), 0) / recentData.length).toFixed(1)
      : 0;
    const avgRisk = recentData.length
      ? (recentData.reduce((s, d) => s + d.riskScore, 0) / recentData.length).toFixed(1)
      : 0;
    const maxRisk = recentData.length
      ? Math.max(...recentData.map((d) => d.riskScore))
      : 0;

    return res.json({
      success: true,
      data: { totalReadings, last24h: recentData.length, avgAudioLevel: avgAudio, avgRiskScore: avgRisk, maxRiskScore: maxRisk }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to compute stats' });
  }
});

module.exports = router;

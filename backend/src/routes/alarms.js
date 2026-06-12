const express = require('express');
const router = express.Router();
const { query } = require('express-validator');
const Alarm = require('../models/Alarm');
const { authenticate, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { ROLES, ALARM_TYPES, ALARM_SEVERITY } = require('../constants');

router.use(authenticate);

// GET /api/alarms?severity=&resolved=&from=&to=&type=&limit=
router.get(
  '/',
  [
    query('limit').optional().isInt({ min: 1, max: 500 }).toInt(),
    query('resolved').optional().isBoolean().toBoolean(),
    query('from').optional().isISO8601(),
    query('to').optional().isISO8601(),
    query('severity').optional().isIn(Object.values(ALARM_SEVERITY)),
    query('type').optional().isIn(Object.values(ALARM_TYPES))
  ],
  validate,
  async (req, res) => {
    try {
      const { severity, resolved, from, to, type, limit = 100 } = req.query;

      const filter = {};
      if (severity) filter.severity = severity;
      if (type) filter.type = type;
      if (resolved !== undefined) filter.resolved = resolved;
      if (from || to) {
        filter.timestamp = {};
        if (from) filter.timestamp.$gte = new Date(from);
        if (to) filter.timestamp.$lte = new Date(to);
      }

      const alarms = await Alarm.find(filter)
        .sort({ timestamp: -1 })
        .limit(Number(limit))
        .populate('deviceId', 'name deviceId')
        .populate('resolvedBy', 'username');

      return res.json({ success: true, data: alarms });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'Failed to fetch alarms' });
    }
  }
);

// GET /api/alarms/export — CSV indir (aynı filtreler desteklenir)
router.get('/export', async (req, res) => {
  try {
    const { severity, resolved, from, to, type } = req.query;
    const filter = {};
    if (severity) filter.severity = severity;
    if (type) filter.type = type;
    if (resolved !== undefined) filter.resolved = resolved === 'true';
    if (from || to) {
      filter.timestamp = {};
      if (from) filter.timestamp.$gte = new Date(from);
      if (to) filter.timestamp.$lte = new Date(to);
    }

    const alarms = await Alarm.find(filter)
      .sort({ timestamp: -1 })
      .limit(5000)
      .populate('deviceId', 'name deviceId')
      .populate('resolvedBy', 'username');

    const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['ID', 'Tip', 'Önem', 'Mesaj', 'Cihaz', 'Zaman', 'Çözüldü', 'Çözen', 'Çözüm Zamanı'].join(',');
    const rows = alarms.map((a) => [
      escape(a._id),
      escape(a.type),
      escape(a.severity),
      escape(a.message),
      escape(a.deviceId?.name || ''),
      escape(a.timestamp?.toISOString() || ''),
      escape(a.resolved ? 'Evet' : 'Hayır'),
      escape(a.resolvedBy?.username || ''),
      escape(a.resolvedAt?.toISOString() || '')
    ].join(','));

    const csv = [header, ...rows].join('\n');
    const filename = `alarmlar-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('﻿' + csv); // BOM → Excel'de Türkçe karakter desteği
  } catch (err) {
    return res.status(500).json({ success: false, error: 'CSV oluşturulamadı' });
  }
});

// POST /api/alarms/:id/resolve
router.post('/:id/resolve', authorize(ROLES.ADMIN, ROLES.OPERATOR), async (req, res) => {
  try {
    const alarm = await Alarm.findById(req.params.id);
    if (!alarm) return res.status(404).json({ success: false, error: 'Alarm not found' });
    if (alarm.resolved) return res.status(400).json({ success: false, error: 'Alarm already resolved' });

    alarm.resolved = true;
    alarm.resolvedBy = req.user._id;
    alarm.resolvedAt = new Date();
    await alarm.save();

    await alarm.populate('deviceId', 'name deviceId');
    await alarm.populate('resolvedBy', 'username');

    return res.json({ success: true, data: alarm });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to resolve alarm' });
  }
});

// GET /api/alarms/stats
router.get('/stats', async (req, res) => {
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [total, todayCount, unresolvedCount, bySeverity, byType, hourlyData] = await Promise.all([
      Alarm.countDocuments(),
      Alarm.countDocuments({ timestamp: { $gte: oneDayAgo } }),
      Alarm.countDocuments({ resolved: false }),
      Alarm.aggregate([
        { $group: { _id: '$severity', count: { $sum: 1 } } }
      ]),
      Alarm.aggregate([
        { $group: { _id: '$type', count: { $sum: 1 } } }
      ]),
      Alarm.aggregate([
        { $match: { timestamp: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } },
        { $group: { _id: { $hour: '$timestamp' }, count: { $sum: 1 } } },
        { $sort: { '_id': 1 } }
      ])
    ]);

    return res.json({
      success: true,
      data: { total, todayCount, unresolvedCount, bySeverity, byType, hourlyData }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to compute alarm stats' });
  }
});

module.exports = router;

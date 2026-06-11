const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { body } = require('express-validator');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth');
const validate = require('../middleware/validate');
const InviteCode = require('../models/InviteCode');

const SALT_ROUNDS = 12;

const registerRules = [
  body('username').trim().isLength({ min: 3, max: 50 }).withMessage('Username must be 3-50 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').optional().isIn(['admin', 'operator', 'viewer']).withMessage('Invalid role')
];

const loginRules = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').notEmpty().withMessage('Password required')
];

router.post('/register', registerRules, validate, async (req, res) => {
  try {
    const { username, email, password, role } = req.body;

    const existing = await User.findOne({ $or: [{ email }, { username }] });
    if (existing) {
      return res.status(400).json({ success: false, error: 'Bu kullanıcı adı veya email zaten kullanımda' });
    }

    // Admin rolü oluşturulamaz (sadece seed ile gelir)
    if (role === 'admin') {
      return res.status(403).json({ success: false, error: 'Admin hesabı oluşturulamaz.' });
    }

    // Operator olmak için geçerli davet kodu gerekli
    let finalRole = 'viewer';
    if (role === 'operator') {
      const { invite_code } = req.body;
      if (!invite_code) {
        return res.status(400).json({ success: false, error: 'Operatör kaydı için davet kodu gerekli.' });
      }
      const invite = await InviteCode.findOne({ code: invite_code.toUpperCase(), isUsed: false });
      if (!invite) {
        return res.status(400).json({ success: false, error: 'Geçersiz veya kullanılmış davet kodu.' });
      }
      finalRole = 'operator';
      // Kodu kullanıldı olarak işaretle (kullanıcı kaydedildikten sonra)
      invite._pendingUse = true;
      req._invite = invite;
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = new User({ username, email, passwordHash, role: finalRole });
    await user.save();

    // Davet kodunu kullanıldı olarak işaretle
    if (req._invite) {
      req._invite.isUsed = true;
      req._invite.usedBy = user._id;
      await req._invite.save();
    }

    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    return res.status(201).json({ success: true, data: { token, user } });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error during registration' });
  }
});

router.post('/login', loginRules, validate, async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    return res.json({ success: true, data: { token, user } });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error during login' });
  }
});

router.get('/me', authenticate, (req, res) => {
  res.json({ success: true, data: req.user });
});

module.exports = router;

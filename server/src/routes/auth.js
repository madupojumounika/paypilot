import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const tokenFor = (user) => jwt.sign({ sub: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
const publicUser = (user) => ({ id: user.id, name: user.name, email: user.email, monthlyBudget: user.monthlyBudget });

router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password } = req.body || {};
    if (typeof name !== 'string' || name.trim().length < 2) return res.status(400).json({ error: 'Enter your name.' });
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (typeof password !== 'string' || password.length < 8) return res.status(400).json({ error: 'Password must contain at least 8 characters.' });
    const normalizedEmail = email.trim().toLowerCase();
    if (await User.exists({ email: normalizedEmail })) return res.status(409).json({ error: 'An account with this email already exists.' });
    const user = await User.create({ name: name.trim(), email: normalizedEmail, passwordHash: await bcrypt.hash(password, 12) });
    return res.status(201).json({ token: tokenFor(user), user: publicUser(user) });
  } catch (error) { return next(error); }
});

router.post('/login', async (req, res, next) => {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ error: 'Email or password is incorrect.' });
    return res.json({ token: tokenFor(user), user: publicUser(user) });
  } catch (error) { return next(error); }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'Account not found.' });
    return res.json({ user: publicUser(user) });
  } catch (error) { return next(error); }
});

export default router;

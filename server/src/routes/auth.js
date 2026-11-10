import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const tokenFor = (user) => jwt.sign({ sub: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
const publicUser = (user) => ({ id: user.id, name: user.name, email: user.email, monthlyBudget: user.monthlyBudget, authProvider: user.googleId ? 'google' : 'email' });

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
    if (!user || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ error: 'Email or password is incorrect.' });
    return res.json({ token: tokenFor(user), user: publicUser(user) });
  } catch (error) { return next(error); }
});


router.post('/google', async (req, res, next) => {
  try {
    const credential = typeof req.body?.credential === 'string' ? req.body.credential : '';
    if (!credential) return res.status(400).json({ error: 'Google did not return an identity token.' });
    if (!process.env.GOOGLE_CLIENT_ID) return res.status(503).json({ error: 'Google sign-in is not configured yet. Add GOOGLE_CLIENT_ID to the server environment.' });
    const verifyResponse = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential), { signal: AbortSignal.timeout(10000) });
    const claims = await verifyResponse.json();
    if (!verifyResponse.ok || claims.aud !== process.env.GOOGLE_CLIENT_ID || claims.email_verified !== 'true' || !claims.sub || !claims.email) {
      return res.status(401).json({ error: 'Google identity verification failed. Please try again.' });
    }
    const email = String(claims.email).trim().toLowerCase();
    let user = await User.findOne({ $or: [{ googleId: claims.sub }, { email }] }).select('+passwordHash');
    if (user && user.googleId && user.googleId !== claims.sub) return res.status(409).json({ error: 'This email is linked to a different Google account.' });
    if (user && !user.googleId && user.passwordHash) return res.status(409).json({ error: 'An email/password account already exists. Sign in with your password first, then connect Google from account settings.' });
    if (!user) {
      user = await User.create({
        name: String(claims.name || claims.given_name || email.split('@')[0]).slice(0, 80),
        email,
        googleId: claims.sub,
        passwordHash: undefined,
        picture: typeof claims.picture === 'string' ? claims.picture : undefined,
      });
    } else if (!user.googleId) {
      user.googleId = claims.sub;
      user.picture = typeof claims.picture === 'string' ? claims.picture : user.picture;
      await user.save();
    }
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

router.patch('/me', requireAuth, async (req, res, next) => {
  try {
    const updates = {};
    if (typeof req.body?.name === 'string' && req.body.name.trim().length >= 2) updates.name = req.body.name.trim();
    if (req.body?.monthlyBudget !== undefined) {
      const monthlyBudget = Number(req.body.monthlyBudget);
      if (!Number.isFinite(monthlyBudget) || monthlyBudget <= 0) return res.status(400).json({ error: 'Monthly budget must be a positive number.' });
      updates.monthlyBudget = monthlyBudget;
    }
    if (typeof req.body?.email === 'string') {
      const email = req.body.email.trim().toLowerCase();
      if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
      updates.email = email;
    }
    const user = await User.findByIdAndUpdate(req.userId, { $set: updates }, { new: true, runValidators: true });
    if (!user) return res.status(404).json({ error: 'Account not found.' });
    return res.json({ user: publicUser(user) });
  } catch (error) { return next(error); }
});

export default router;

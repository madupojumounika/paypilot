import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/auth.js';
import ruleRoutes from './routes/rules.js';
import approvalRoutes from './routes/approvals.js';
import transactionRoutes from './routes/transactions.js';
import assistantRoutes from './routes/assistant.js';
import savedProductRoutes from './routes/savedProducts.js';

const app = express();
const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map(value => value.trim());

app.use(helmet({ crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }, contentSecurityPolicy: { directives: { ...helmet.contentSecurityPolicy.getDefaultDirectives(), 'script-src': ["'self'", 'https://accounts.google.com/gsi/client'], 'frame-src': ["'self'", 'https://accounts.google.com/gsi/'], 'connect-src': ["'self'", 'https://accounts.google.com/gsi/', 'https://oauth2.googleapis.com'], 'style-src': ["'self'", "'unsafe-inline'", 'https://accounts.google.com/gsi/style'] } } }));
app.use(cors({ origin: (origin, callback) => {
  if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
  return callback(new Error('Origin is not allowed by CORS.'));
}, credentials: true }));
app.use(express.json({ limit: '20kb' }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false }));
app.get('/api/health', (_req, res) => res.json({ status: 'ok', databaseConfigured: Boolean(process.env.MONGODB_URI), paymentsEnabled: false }));
app.use('/api/auth', authRoutes);
app.use('/api/rules', ruleRoutes);
app.use('/api/approvals', approvalRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/saved-products', savedProductRoutes);
app.use('/api/assistant', rateLimit({ windowMs: 60 * 1000, limit: 8, standardHeaders: 'draft-7', legacyHeaders: false }), assistantRoutes);
app.use((_req, res) => res.status(404).json({ error: 'Route not found.' }));
app.use((error, _req, res, _next) => {
  if (error?.code === 11000) return res.status(409).json({ error: 'That email is already registered.' });
  if (error?.name === 'ValidationError') return res.status(400).json({ error: 'Submitted data is invalid.' });
  console.error(error);
  return res.status(500).json({ error: 'An unexpected server error occurred.' });
});

export default app;

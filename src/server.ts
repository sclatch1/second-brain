import express from 'express';
import cors from 'cors';
import { agentRoutes } from './routes/agent.js';
import { ingestRouter } from './routes/ingest.js';
import { loginRoutes } from './routes/login.js';
import { errorHandler } from './middleware/errorHandler.js';
import rateLimit from 'express-rate-limit';
import 'dotenv/config';

const allowedOrigins = [
  process.env.FRONTEND_URL, // deployed URL
  'http://localhost:5173', // local vite dev server
].filter((origin): origin is string => Boolean(origin));

const app = express();
app.set('trust proxy', 1);

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5, // limit each IP to 5 requests per window
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // limit each IP to 30 requests per window
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/login', loginLimiter);
app.use('/api/', limiter);

app.use('/api/agent', agentRoutes);
app.use('/api/ingest', ingestRouter);
app.use('/api/login', loginRoutes);

app.use(errorHandler); // must be registered LAST

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`API running on port ${PORT}`));

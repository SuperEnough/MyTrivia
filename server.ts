import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface BoardEntry {
  id: number;
  name: string;
  score: number;
  mainScore: number;
  blitzScore: number;
  timeBonus: number;
  createdAt: number;
  deviceId?: string;
  fingerprint?: string;
}

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json());

// Ensure data directory exists
const DATA_DIR = path.resolve(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'leaderboard.json');

function loadEntries(): BoardEntry[] {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        return sortEntries(parsed);
      }
    }
    // Write fresh empty board
    fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2), 'utf-8');
    return [];
  } catch (err) {
    console.error('Failed to load leaderboard from file:', err);
    return [];
  }
}

function saveEntries(entries: BoardEntry[]): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(entries, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save leaderboard to file:', err);
  }
}

function sortEntries(entries: BoardEntry[]): BoardEntry[] {
  return [...entries].sort((a, b) => b.score - a.score || b.timeBonus - a.timeBonus || a.id - b.id);
}

let entriesCache = loadEntries();

// Active SSE client connections for real-time live synchronization
const sseClients = new Set<express.Response>();

function broadcastLeaderboardUpdate(newEntry: BoardEntry) {
  const payload = JSON.stringify({
    type: 'new_entry',
    entry: newEntry,
    entries: sortEntries(entriesCache).slice(0, 50),
    totalRuns: entriesCache.length,
  });

  for (const client of sseClients) {
    try {
      client.write(`data: ${payload}\n\n`);
    } catch {
      sseClients.delete(client);
    }
  }
}

function broadcastLeaderboardClear() {
  const payload = JSON.stringify({
    type: 'clear',
    entries: [],
    totalRuns: 0,
  });

  for (const client of sseClients) {
    try {
      client.write(`data: ${payload}\n\n`);
    } catch {
      sseClients.delete(client);
    }
  }
}

// REST API Endpoints
app.get('/api/leaderboard', (_req, res) => {
  const sorted = sortEntries(entriesCache);
  res.json({
    entries: sorted.slice(0, 50),
    totalRuns: sorted.length,
    highestScore: sorted.length > 0 ? sorted[0].score : 0,
  });
});

app.get('/api/leaderboard/check', (req, res) => {
  const nameQuery = String(req.query.name || '').trim().toLowerCase();
  const deviceQuery = String(req.query.deviceId || '').trim();
  const fingerprintQuery = String(req.query.fingerprint || '').trim();

  let deviceEntry: BoardEntry | null = null;
  if (deviceQuery) {
    deviceEntry = entriesCache.find(e => e.deviceId && e.deviceId === deviceQuery) || null;
  }
  if (!deviceEntry && fingerprintQuery && fingerprintQuery !== 'fp_generic') {
    deviceEntry = entriesCache.find(e => e.fingerprint && e.fingerprint === fingerprintQuery) || null;
  }

  let nameEntry: BoardEntry | null = null;
  if (nameQuery) {
    nameEntry = entriesCache.find(e => e.name.trim().toLowerCase() === nameQuery) || null;
  }

  res.json({
    deviceLocked: !!deviceEntry,
    deviceEntry,
    taken: !!nameEntry,
    nameTaken: !!nameEntry,
    existingEntry: nameEntry || deviceEntry,
  });
});

app.post('/api/leaderboard', (req, res) => {
  const { name, score, mainScore, blitzScore, timeBonus, deviceId, fingerprint } = req.body;

  const cleanedName = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ').slice(0, 18) : '';
  if (!cleanedName) {
    res.status(400).json({ error: 'Player name is required.' });
    return;
  }

  // 1. Enforce strict device check (one attempt per device via deviceId or fingerprint)
  const cleanedDeviceId = typeof deviceId === 'string' ? deviceId.trim().slice(0, 64) : '';
  const cleanedFingerprint = typeof fingerprint === 'string' ? fingerprint.trim().slice(0, 64) : '';

  let existingDeviceEntry: BoardEntry | undefined;
  if (cleanedDeviceId) {
    existingDeviceEntry = entriesCache.find(e => e.deviceId && e.deviceId === cleanedDeviceId);
  }
  if (!existingDeviceEntry && cleanedFingerprint && cleanedFingerprint !== 'fp_generic') {
    existingDeviceEntry = entriesCache.find(e => e.fingerprint && e.fingerprint === cleanedFingerprint);
  }

  if (existingDeviceEntry) {
    res.status(400).json({
      error: `This device has already logged its single attempt (Player: ${existingDeviceEntry.name}, Score: ${existingDeviceEntry.score} pts). Strictly one attempt is permitted per device/player for the contest.`,
      deviceLocked: true,
      existingEntry: existingDeviceEntry,
    });
    return;
  }

  // 2. Enforce strict unique player name (one attempt per name)
  const normalizedNew = cleanedName.toLowerCase();
  const alreadyPlayed = entriesCache.some(e => e.name.trim().toLowerCase() === normalizedNew);
  if (alreadyPlayed) {
    res.status(400).json({
      error: `${cleanedName} has already used their one attempt. Try a different player name.`,
      nameTaken: true,
    });
    return;
  }

  const validatedScore = Math.max(0, Number(score) || 0);
  const validatedMain = Math.max(0, Math.min(500, Number(mainScore) || 0));
  const validatedBlitz = Math.max(0, Number(blitzScore) || 0);
  const validatedTimeBonus = Math.max(0, Number(timeBonus) || 0);

  const newEntry: BoardEntry = {
    id: Date.now(),
    name: cleanedName,
    score: validatedScore,
    mainScore: validatedMain,
    blitzScore: validatedBlitz,
    timeBonus: validatedTimeBonus,
    createdAt: Date.now(),
    deviceId: cleanedDeviceId || undefined,
    fingerprint: cleanedFingerprint || undefined,
  };

  entriesCache.push(newEntry);
  entriesCache = sortEntries(entriesCache);
  saveEntries(entriesCache);

  broadcastLeaderboardUpdate(newEntry);

  const rank = entriesCache.findIndex(e => e.id === newEntry.id) + 1;

  res.status(201).json({
    success: true,
    entry: newEntry,
    rank,
    entries: entriesCache.slice(0, 50),
    totalRuns: entriesCache.length,
  });
});

// Clear/Reset Leaderboard endpoint
app.post('/api/leaderboard/clear', (_req, res) => {
  entriesCache = [];
  saveEntries([]);
  broadcastLeaderboardClear();
  res.json({
    success: true,
    message: 'Leaderboard cleared and standings reset successfully.',
    entries: [],
    totalRuns: 0,
  });
});

app.delete('/api/leaderboard', (_req, res) => {
  entriesCache = [];
  saveEntries([]);
  broadcastLeaderboardClear();
  res.json({
    success: true,
    message: 'Leaderboard cleared and standings reset successfully.',
    entries: [],
    totalRuns: 0,
  });
});

// Real-time Server-Sent Events (SSE) Stream
app.get('/api/leaderboard/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Send immediate initial sync
  const initialPayload = JSON.stringify({
    type: 'init',
    entries: sortEntries(entriesCache).slice(0, 50),
    totalRuns: entriesCache.length,
  });
  res.write(`data: ${initialPayload}\n\n`);

  sseClients.add(res);

  // Send periodic keep-alive ping
  const interval = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch {
      clearInterval(interval);
      sseClients.delete(res);
    }
  }, 20000);

  req.on('close', () => {
    clearInterval(interval);
    sseClients.delete(res);
  });
});

async function startServer() {
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
        watch: process.env.DISABLE_HMR === 'true' ? null : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Game running at http://0.0.0.0:${PORT} (isDev: ${isDev})`);
  });
}

startServer().catch(err => {
  console.error('[Server] Fatal startup error:', err);
  process.exit(1);
});

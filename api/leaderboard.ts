// Vercel Serverless Function handler for /api/leaderboard

interface BoardEntry {
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

// In-memory cache for serverless instance lifetime - starts fresh & cleared
let entriesCache: BoardEntry[] = [];

function sortEntries(entries: BoardEntry[]): BoardEntry[] {
  return [...entries].sort((a, b) => b.score - a.score || b.timeBonus - a.timeBonus || a.id - b.id);
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Handle clearing
  if (req.method === 'DELETE' || (req.method === 'POST' && req.query?.action === 'clear')) {
    entriesCache = [];
    res.status(200).json({
      success: true,
      message: 'Leaderboard cleared and standings reset successfully.',
      entries: [],
      totalRuns: 0,
    });
    return;
  }

  // Handle verification check
  if (req.method === 'GET' && (req.query?.action === 'check' || req.query?.deviceId || req.query?.name || req.query?.fingerprint)) {
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

    res.status(200).json({
      deviceLocked: !!deviceEntry,
      deviceEntry,
      taken: !!nameEntry,
      nameTaken: !!nameEntry,
      existingEntry: nameEntry || deviceEntry,
    });
    return;
  }

  if (req.method === 'GET') {
    const sorted = sortEntries(entriesCache);
    res.status(200).json({
      entries: sorted.slice(0, 50),
      totalRuns: sorted.length,
      highestScore: sorted.length > 0 ? sorted[0].score : 0,
    });
    return;
  }

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { name, score, mainScore, blitzScore, timeBonus, deviceId, fingerprint } = body;

    const cleanedName = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ').slice(0, 18) : '';
    if (!cleanedName) {
      res.status(400).json({ error: 'Player name is required.' });
      return;
    }

    // 1. Strict Device Lock check (one attempt per device)
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
        error: `This device has already used its single attempt (Player: ${existingDeviceEntry.name}, Score: ${existingDeviceEntry.score} pts). Only one attempt is permitted per device/player.`,
        deviceLocked: true,
        existingEntry: existingDeviceEntry,
      });
      return;
    }

    // 2. Strict Name check (one attempt per name)
    const normalizedNew = cleanedName.toLowerCase();
    const alreadyPlayed = entriesCache.some(e => e.name.trim().toLowerCase() === normalizedNew);
    if (alreadyPlayed) {
      res.status(400).json({
        error: `${cleanedName} has already used their one chance. Try a different player name.`,
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

    const rank = entriesCache.findIndex(e => e.id === newEntry.id) + 1;

    res.status(201).json({
      success: true,
      entry: newEntry,
      rank,
      entries: entriesCache.slice(0, 50),
      totalRuns: entriesCache.length,
    });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}

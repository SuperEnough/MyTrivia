// Vercel Serverless Function handler for /api/leaderboard
import type { IncomingMessage, ServerResponse } from 'http';

interface BoardEntry {
  id: number;
  name: string;
  score: number;
  mainScore: number;
  blitzScore: number;
  timeBonus: number;
  createdAt: number;
}

// In-memory cache for serverless instance lifetime
let entriesCache: BoardEntry[] = [
  {
    id: 1,
    name: 'Sipho_K',
    score: 870,
    mainScore: 500,
    blitzScore: 370,
    timeBonus: 70,
    createdAt: Date.now() - 7200000,
  },
  {
    id: 2,
    name: 'Tumi_M',
    score: 790,
    mainScore: 400,
    blitzScore: 390,
    timeBonus: 90,
    createdAt: Date.now() - 18000000,
  },
  {
    id: 3,
    name: 'Vuyo_99',
    score: 650,
    mainScore: 400,
    blitzScore: 250,
    timeBonus: 50,
    createdAt: Date.now() - 43200000,
  },
];

function sortEntries(entries: BoardEntry[]): BoardEntry[] {
  return [...entries].sort((a, b) => b.score - a.score || b.timeBonus - a.timeBonus || a.id - b.id);
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
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
    const { name, score, mainScore, blitzScore, timeBonus } = body;

    const cleanedName = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ').slice(0, 18) : '';
    if (!cleanedName) {
      res.status(400).json({ error: 'Player name is required.' });
      return;
    }

    const normalizedNew = cleanedName.toLowerCase();
    const alreadyPlayed = entriesCache.some(e => e.name.trim().toLowerCase() === normalizedNew);
    if (alreadyPlayed) {
      res.status(400).json({
        error: `${cleanedName} has already used their one chance. Try a different player name.`,
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

// Vercel Serverless Function handler for /api/leaderboard/check
import leaderboardHandler from '../leaderboard';

export default async function handler(req: any, res: any) {
  // Delegate to main leaderboard handler which checks query params
  req.query = req.query || {};
  req.query.action = 'check';
  return leaderboardHandler(req, res);
}

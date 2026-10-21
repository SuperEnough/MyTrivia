// Vercel Serverless Function handler for /api/leaderboard/clear
import leaderboardHandler from '../leaderboard';

export default async function handler(req: any, res: any) {
  req.query = req.query || {};
  req.query.action = 'clear';
  return leaderboardHandler(req, res);
}

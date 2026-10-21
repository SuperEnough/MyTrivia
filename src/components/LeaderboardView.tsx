import React from 'react';
import { BoardEntry } from '../types';

interface LeaderboardViewProps {
  label: string;
  entries: BoardEntry[];
  lastEntryId: number | null;
  liveStatus?: 'connected' | 'reconnecting' | 'offline';
  recentEntryId?: number | null;
}

export const LeaderboardView: React.FC<LeaderboardViewProps> = ({
  label,
  entries,
  lastEntryId,
  liveStatus = 'connected',
  recentEntryId,
}) => {
  const displayRows = entries.slice(0, 7);

  return (
    <div className="leaderboard">
      <div className="board-label">
        <span>{label}</span>
        <span>
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full ${
              liveStatus === 'connected'
                ? 'bg-[var(--accent)] shadow-[0_0_8px_var(--accent)] animate-pulse'
                : 'bg-amber-400'
            }`}
          />
          {liveStatus === 'connected' ? 'LIVE MULTIPLAYER' : 'SYNCING'} · MAIN / TOTAL
        </span>
      </div>

      <div className="board-head">
        <span>#</span>
        <span>PLAYER</span>
        <span>MAIN</span>
        <em>TOTAL</em>
      </div>

      <ol>
        {displayRows.length > 0 ? (
          displayRows.map((entry, index) => {
            const isMe = entry.id === lastEntryId;
            const isRecent = entry.id === recentEntryId;
            return (
              <li
                key={entry.id || index}
                className={`board-row ${isMe ? 'is-me' : ''} ${isRecent ? 'is-recent' : ''}`}
              >
                <b className="tabular-nums">{String(index + 1).padStart(2, '0')}</b>
                <span className="board-name" title={entry.name}>
                  {entry.name} {isMe && <span className="text-[10px] text-[var(--accent)] ml-1 font-bold">(YOU)</span>}
                </span>
                <span className="board-main tabular-nums text-center text-xs text-[#a9aac6] font-mono">
                  {entry.mainScore}
                </span>
                <em className="tabular-nums font-mono">{entry.score}</em>
              </li>
            );
          })
        ) : (
          <li className="board-empty">No scores logged yet. Be the first to claim the signal!</li>
        )}
      </ol>
    </div>
  );
};

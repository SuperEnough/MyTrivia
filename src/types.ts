export type Screen = 'intro' | 'quiz' | 'blitz-intro' | 'blitz' | 'results';
export type Theme = 'car' | 'flavor' | 'music' | 'game' | 'mind' | 'blitz';

export interface Choice {
  id: string;
  label: string;
  src?: string;
  alt?: string;
  symbol?: string;
}

export interface Question {
  theme: Theme;
  eyebrow: string;
  title: string;
  prompt: string;
  note: string;
  hero: [string, string];
  choices: Choice[];
  correct: string;
  reveal: string;
}

export interface BoardEntry {
  id: number;
  name: string;
  score: number;
  mainScore: number;
  blitzScore: number;
  timeBonus: number;
  createdAt?: number;
  deviceId?: string;
  fingerprint?: string;
}

export interface DeviceAttempt {
  name: string;
  score: number;
  mainScore: number;
  blitzScore: number;
  timeBonus: number;
  entryId: number;
  timestamp: number;
}

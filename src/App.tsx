/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Screen, Theme, BoardEntry, Choice, Question, DeviceAttempt } from './types';
import { questions as defaultQuestions, blitzQuestions } from './data';
import { sound } from './audio';
import { AtmosphereCanvas } from './components/AtmosphereCanvas';
import { LeaderboardView } from './components/LeaderboardView';
import { Volume2, VolumeX, Share2, Check, AlertCircle, ArrowUpRight, Lock, Trash2 } from 'lucide-react';

const LOCAL_STORAGE_KEY = 'how-well-do-you-know-me.leaderboard.v6';
const DEVICE_ID_KEY = 'how-well-do-you-know-me.device-id.v5';
const DEVICE_ATTEMPT_KEY = 'how-well-do-you-know-me.device-attempt.v5';

function shuffleChoices(qList: Question[]): Question[] {
  return qList.map(q => {
    const shuffled = [...q.choices];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return { ...q, choices: shuffled };
  });
}

function getCookie(name: string): string | null {
  try {
    const match = document.cookie.match(new RegExp('(^|;\\s*)(' + name + ')=([^;]*)'));
    return match ? decodeURIComponent(match[3]) : null;
  } catch {
    return null;
  }
}

function setCookie(name: string, value: string) {
  try {
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000; SameSite=Lax`;
  } catch {
    // ignore
  }
}

function removeCookie(name: string) {
  try {
    document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
  } catch {
    // ignore
  }
}

function getDeviceFingerprint(): string {
  try {
    const screenPart = `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`;
    const navPart = `${navigator.language}_${navigator.hardwareConcurrency || 0}_${navigator.maxTouchPoints || 0}`;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const platform = (navigator as any).userAgentData?.platform || navigator.platform || '';
    return `fp_${btoa(`${screenPart}|${navPart}|${tz}|${platform}`).replace(/[^a-zA-Z0-9]/g, '').slice(0, 24)}`;
  } catch {
    return 'fp_generic';
  }
}

function getOrCreateDeviceId(): string {
  let id = '';
  try {
    id = localStorage.getItem(DEVICE_ID_KEY) || sessionStorage.getItem(DEVICE_ID_KEY) || getCookie(DEVICE_ID_KEY) || '';
    if (!id) {
      id = 'dev_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now().toString(36);
    }
    // Sync across all 3 storage mechanisms
    localStorage.setItem(DEVICE_ID_KEY, id);
    sessionStorage.setItem(DEVICE_ID_KEY, id);
    setCookie(DEVICE_ID_KEY, id);
  } catch {
    id = 'dev_fallback_' + Date.now();
  }
  return id;
}

function getLocalDeviceAttempt(): DeviceAttempt | null {
  try {
    const raw = localStorage.getItem(DEVICE_ATTEMPT_KEY) || sessionStorage.getItem(DEVICE_ATTEMPT_KEY) || getCookie(DEVICE_ATTEMPT_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return null;
}

function saveLocalDeviceAttempt(attempt: DeviceAttempt) {
  try {
    const serialized = JSON.stringify(attempt);
    localStorage.setItem(DEVICE_ATTEMPT_KEY, serialized);
    sessionStorage.setItem(DEVICE_ATTEMPT_KEY, serialized);
    setCookie(DEVICE_ATTEMPT_KEY, serialized);
  } catch {
    // ignore
  }
}

function clearLocalDeviceAttempt() {
  try {
    localStorage.removeItem(DEVICE_ATTEMPT_KEY);
    sessionStorage.removeItem(DEVICE_ATTEMPT_KEY);
    removeCookie(DEVICE_ATTEMPT_KEY);
  } catch {
    // ignore
  }
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('intro');
  const [playerName, setPlayerName] = useState<string>('');
  const [questionIndex, setQuestionIndex] = useState<number>(0);
  const [selectedMain, setSelectedMain] = useState<string | null>(null);
  const [mainAnswered, setMainAnswered] = useState<boolean>(false);
  const [mainScore, setMainScore] = useState<number>(0);
  const [mainCorrectCount, setMainCorrectCount] = useState<number>(0);

  // Scrambled questions for the current session
  const [activeQuestions, setActiveQuestions] = useState<Question[]>(() => shuffleChoices(defaultQuestions));

  // Blitz state
  const [activeBlitzQuestions, setActiveBlitzQuestions] = useState<Question[]>(() => shuffleChoices(blitzQuestions));
  const [blitzSelections, setBlitzSelections] = useState<[string | null, string | null]>([null, null]);
  const [blitzRemaining, setBlitzRemaining] = useState<number>(30);
  const [blitzDeadline, setBlitzDeadline] = useState<number>(0);
  const [blitzScore, setBlitzScore] = useState<number>(0);
  const [timeBonus, setTimeBonus] = useState<number>(0);
  const [finalScore, setFinalScore] = useState<number>(0);

  // Device Lock & Integrity state
  const [deviceId] = useState<string>(() => getOrCreateDeviceId());
  const [fingerprint] = useState<string>(() => getDeviceFingerprint());
  const [deviceAttempt, setDeviceAttempt] = useState<DeviceAttempt | null>(() => getLocalDeviceAttempt());

  // Leaderboard state
  const [entries, setEntries] = useState<BoardEntry[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return [];
  });
  const [lastEntryId, setLastEntryId] = useState<number | null>(null);
  const [recentEntryId, setRecentEntryId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string>('');
  const [soundOn, setSoundOn] = useState<boolean>(sound.enabled);
  const [liveStatus, setLiveStatus] = useState<'connected' | 'reconnecting' | 'offline'>('connected');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [copiedShare, setCopiedShare] = useState<boolean>(false);

  const blitzTimerRef = useRef<number | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  // Clear legacy mock boards on startup and verify device state with server
  useEffect(() => {
    try {
      for (let i = 1; i <= 5; i++) {
        localStorage.removeItem(`how-well-do-you-know-me.leaderboard.v${i}`);
        localStorage.removeItem(`how-well-do-you-know-me.device-id.v${i}`);
        localStorage.removeItem(`how-well-do-you-know-me.device-attempt.v${i}`);
      }
    } catch {
      // ignore
    }

    // Check if server already has a record for this deviceId or browser fingerprint
    if (deviceId) {
      fetch(`/api/leaderboard/check?deviceId=${encodeURIComponent(deviceId)}&fingerprint=${encodeURIComponent(fingerprint)}`)
        .then(res => res.json())
        .then(data => {
          if (data.deviceLocked && data.deviceEntry) {
            const serverAttempt: DeviceAttempt = {
              name: data.deviceEntry.name,
              score: data.deviceEntry.score,
              mainScore: data.deviceEntry.mainScore,
              blitzScore: data.deviceEntry.blitzScore,
              timeBonus: data.deviceEntry.timeBonus,
              entryId: data.deviceEntry.id,
              timestamp: data.deviceEntry.createdAt || Date.now(),
            };
            setDeviceAttempt(serverAttempt);
            saveLocalDeviceAttempt(serverAttempt);
          } else if (!data.deviceLocked) {
            // Server board is empty or has no record for this device - ensure local attempt is synchronized
            setDeviceAttempt(null);
            clearLocalDeviceAttempt();
          }
        })
        .catch(() => {
          // ignore
        });
    }
  }, [deviceId, fingerprint]);

  // Update theme on body
  useEffect(() => {
    let currentTheme: Theme = 'intro' as any;
    if (screen === 'quiz') {
      currentTheme = activeQuestions[questionIndex]?.theme || 'car';
    } else if (screen === 'blitz' || screen === 'blitz-intro') {
      currentTheme = 'blitz';
    }
    document.body.dataset.theme = currentTheme;
  }, [screen, questionIndex, activeQuestions]);

  // Focus name input on intro screen if not locked
  useEffect(() => {
    if (screen === 'intro' && !deviceAttempt) {
      nameInputRef.current?.focus();
    }
  }, [screen, deviceAttempt]);

  // Sync leaderboard with backend REST & SSE stream
  useEffect(() => {
    let sse: EventSource | null = null;
    let pollInterval: number | null = null;

    const fetchLeaderboard = async () => {
      try {
        const res = await fetch('/api/leaderboard');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.entries)) {
            setEntries(data.entries);
            try {
              localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data.entries));
            } catch {
              // ignore
            }
          }
          setLiveStatus('connected');
        }
      } catch {
        setLiveStatus('reconnecting');
      }
    };

    fetchLeaderboard();

    // Setup Server-Sent Events (SSE) for instant multiplayer updates
    try {
      sse = new EventSource('/api/leaderboard/stream');

      sse.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'init' && Array.isArray(payload.entries)) {
            setEntries(payload.entries);
            setLiveStatus('connected');
          } else if (payload.type === 'new_entry' && Array.isArray(payload.entries)) {
            setEntries(payload.entries);
            setLiveStatus('connected');
            if (payload.entry && payload.entry.id !== lastEntryId) {
              setRecentEntryId(payload.entry.id);
              showToast(`⚡ Live Update: ${payload.entry.name} scored ${payload.entry.score} pts!`);
              setTimeout(() => setRecentEntryId(null), 3000);
            }
          } else if (payload.type === 'clear') {
            setEntries([]);
            setDeviceAttempt(null);
            clearLocalDeviceAttempt();
            try {
              localStorage.removeItem(LOCAL_STORAGE_KEY);
            } catch {
              // ignore
            }
            showToast('Leaderboard and contest standings were reset.');
          }
        } catch {
          // ignore parse errors
        }
      };

      sse.onerror = () => {
        setLiveStatus('reconnecting');
      };
    } catch {
      setLiveStatus('offline');
    }

    // Secondary polling interval in case SSE drops
    pollInterval = window.setInterval(fetchLeaderboard, 6000);

    return () => {
      if (sse) sse.close();
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [lastEntryId]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(prev => (prev === msg ? null : prev));
    }, 4000);
  };

  const handleToggleSound = () => {
    const next = sound.toggle();
    setSoundOn(next);
  };

  // Start game flow with strict single attempt enforcement
  const handleStartGame = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    // 1. Device Lock check
    if (deviceAttempt) {
      setNotice(`This device has already logged its single attempt as ${deviceAttempt.name} (${deviceAttempt.score} pts).`);
      sound.playWrong();
      return;
    }

    const cleaned = playerName.trim().replace(/\s+/g, ' ').slice(0, 18);
    if (!cleaned) {
      setNotice('Drop a name first. The leaderboard needs a legend.');
      sound.playWrong();
      return;
    }

    if (cleaned.length < 2) {
      setNotice('Player name must be at least 2 characters.');
      sound.playWrong();
      return;
    }

    // 2. Name check locally first against current loaded standings
    const alreadyPlayedLocal = entries.some(entry => entry.name.toLowerCase() === cleaned.toLowerCase());
    if (alreadyPlayedLocal) {
      setNotice(`${cleaned} has already used their one attempt. Try a different player name.`);
      sound.playWrong();
      return;
    }

    // 3. Double check device + name with server before allowing the quiz to start
    try {
      const res = await fetch(`/api/leaderboard/check?deviceId=${encodeURIComponent(deviceId)}&fingerprint=${encodeURIComponent(fingerprint)}&name=${encodeURIComponent(cleaned)}`);
      if (res.ok) {
        const checkData = await res.json();
        if (checkData.deviceLocked) {
          setNotice('This device has already completed its single attempt. Each device is limited to 1 run.');
          sound.playWrong();
          return;
        }
        if (checkData.nameTaken || checkData.taken) {
          setNotice(`${cleaned} has already used their one chance. Try a different player name.`);
          sound.playWrong();
          return;
        }
      }
    } catch {
      // Continue if server check has temporary network glitch
    }

    // Scramble both main questions choices and blitz choices so no two runs are identical
    setActiveQuestions(shuffleChoices(defaultQuestions));
    setActiveBlitzQuestions(shuffleChoices(blitzQuestions));

    sound.playSelect();
    setPlayerName(cleaned);
    setNotice('');
    setQuestionIndex(0);
    setSelectedMain(null);
    setMainAnswered(false);
    setMainScore(0);
    setMainCorrectCount(0);
    setBlitzSelections([null, null]);
    setBlitzRemaining(30);
    setBlitzScore(0);
    setTimeBonus(0);
    setFinalScore(0);
    setLastEntryId(null);
    setScreen('quiz');
  };

  // Choose main question choice
  const handleChooseMain = (id: string) => {
    if (screen !== 'quiz' || mainAnswered) return;
    const currentQ = activeQuestions[questionIndex];
    const isAnswerCorrect = id === currentQ.correct;

    setSelectedMain(id);
    setMainAnswered(true);

    if (isAnswerCorrect) {
      setMainScore(prev => prev + 100);
      setMainCorrectCount(prev => prev + 1);
      sound.playCorrect();
    } else {
      sound.playWrong();
    }
  };

  // Advance to next main question or blitz
  const handleNextMain = () => {
    if (!mainAnswered) return;
    sound.playSelect();
    if (questionIndex === activeQuestions.length - 1) {
      setScreen('blitz-intro');
    } else {
      setQuestionIndex(prev => prev + 1);
      setSelectedMain(null);
      setMainAnswered(false);
    }
  };

  // Start Blitz with scrambled options & zero exposed answers
  const handleStartBlitz = () => {
    sound.playSelect();
    if (blitzTimerRef.current) clearInterval(blitzTimerRef.current);
    setActiveBlitzQuestions(shuffleChoices(blitzQuestions));
    setBlitzSelections([null, null]);
    setBlitzRemaining(30);
    const deadline = Date.now() + 30000;
    setBlitzDeadline(deadline);
    setScreen('blitz');

    blitzTimerRef.current = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setBlitzRemaining(remaining);
      if (remaining <= 10 && remaining > 0) {
        sound.playTick();
      }
      if (remaining <= 0) {
        handleFinishBlitz(0);
      }
    }, 100);
  };

  const handleChooseBlitz = (qIdx: number, ansId: string) => {
    if (screen !== 'blitz' || blitzRemaining <= 0) return;
    sound.playSelect();
    setBlitzSelections(prev => {
      const copy: [string | null, string | null] = [...prev];
      copy[qIdx] = ansId;
      return copy;
    });
  };

  // Finish Blitz and permanently lock device attempt
  const handleFinishBlitz = useCallback((forcedRemaining?: number) => {
    if (blitzTimerRef.current) {
      clearInterval(blitzTimerRef.current);
      blitzTimerRef.current = null;
    }

    const currentRemaining =
      typeof forcedRemaining === 'number'
        ? forcedRemaining
        : Math.max(0, Math.ceil((blitzDeadline - Date.now()) / 1000));

    setBlitzRemaining(currentRemaining);

    // Dynamic scoring based on actual correct answers
    const q0 = activeBlitzQuestions[0];
    const q1 = activeBlitzQuestions[1];
    const q0Correct = blitzSelections[0] === q0?.correct;
    const q1Correct = blitzSelections[1] === q1?.correct;
    const dayPoints = q0Correct ? 150 : (blitzSelections[0] === '305' && q0?.correct === '304' ? 50 : 0);
    const leftPoints = q1Correct ? 150 : 0;
    const bonus = currentRemaining * 10;
    const totalBlitz = dayPoints + leftPoints + bonus;
    const totalFinal = mainScore + totalBlitz;

    setBlitzScore(totalBlitz);
    setTimeBonus(bonus);
    setFinalScore(totalFinal);
    setScreen('results');

    sound.playFanfare();

    // Lock device attempt locally across localStorage, sessionStorage, and cookie
    const newEntryId = Date.now();
    setLastEntryId(newEntryId);

    const attemptRecord: DeviceAttempt = {
      name: playerName || 'Anonymous',
      score: totalFinal,
      mainScore: mainScore,
      blitzScore: totalBlitz,
      timeBonus: bonus,
      entryId: newEntryId,
      timestamp: Date.now(),
    };

    saveLocalDeviceAttempt(attemptRecord);
    setDeviceAttempt(attemptRecord);

    const entryPayload: BoardEntry = {
      id: newEntryId,
      name: playerName || 'Anonymous',
      score: totalFinal,
      mainScore: mainScore,
      blitzScore: totalBlitz,
      timeBonus: bonus,
      createdAt: Date.now(),
      deviceId: deviceId,
      fingerprint: fingerprint,
    };

    // Save to local cache first
    setEntries(prev => {
      const updated = [entryPayload, ...prev.filter(e => e.id !== newEntryId)].sort(
        (a, b) => b.score - a.score || b.timeBonus - a.timeBonus || a.id - b.id
      );
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated.slice(0, 50)));
      } catch {
        // ignore
      }
      return updated;
    });

    // Send to backend with deviceId and browser fingerprint
    fetch('/api/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entryPayload),
    })
      .then(async res => {
        const data = await res.json();
        if (!res.ok) {
          showToast(`⚠️ ${data.error || 'Submission rejected by server'}`);
          sound.playWrong();
          return;
        }
        if (data.entries && Array.isArray(data.entries)) {
          setEntries(data.entries);
        }
        showToast('Official attempt locked and verified on global standings!');
      })
      .catch(() => {
        // Offline resilience handles local storage
      });
  }, [blitzDeadline, blitzSelections, mainScore, playerName, deviceId, fingerprint, activeBlitzQuestions]);

  // Reset contest standings (Organizer / host utility)
  const handleClearLeaderboard = async () => {
    const confirmed = window.confirm(
      'Reset all leaderboard standings and device attempts for a new contest round? This will clear the board for everyone.'
    );
    if (!confirmed) return;

    try {
      const res = await fetch('/api/leaderboard/clear', { method: 'POST' });
      if (res.ok) {
        setEntries([]);
        setDeviceAttempt(null);
        clearLocalDeviceAttempt();
        try {
          localStorage.removeItem(LOCAL_STORAGE_KEY);
        } catch {
          // ignore
        }
        showToast('Leaderboard cleared and contest attempts reset!');
        sound.playSelect();
      }
    } catch {
      showToast('Failed to clear leaderboard on server.');
    }
  };

  // Return home / view standings
  const handleReturnHome = () => {
    sound.playSelect();
    if (blitzTimerRef.current) {
      clearInterval(blitzTimerRef.current);
      blitzTimerRef.current = null;
    }
    setScreen('intro');
    setNotice('');
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (screen === 'quiz') {
        const num = Number(e.key);
        const currentQChoices = activeQuestions[questionIndex]?.choices || [];
        if (!mainAnswered && num >= 1 && num <= currentQChoices.length) {
          handleChooseMain(currentQChoices[num - 1].id);
        } else if (mainAnswered && e.key === 'Enter') {
          handleNextMain();
        }
      } else if (screen === 'blitz') {
        if (e.key === 'Enter' && blitzSelections.every(Boolean)) {
          handleFinishBlitz();
        }
      } else if (screen === 'results' && e.key === 'Enter') {
        handleReturnHome();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [screen, questionIndex, mainAnswered, blitzSelections, handleFinishBlitz, activeQuestions]);

  // Rank calculation
  const getRank = (): number => {
    const targetId = lastEntryId || (deviceAttempt ? deviceAttempt.entryId : null);
    const idx = entries.findIndex(e => e.id === targetId);
    return idx >= 0 ? idx + 1 : entries.length + 1;
  };

  // Share score
  const handleShareScore = () => {
    const shareText = `🎯 I scored ${finalScore} pts in 'I Know You / Or Do I?' (Rank #${getRank()})! Can you beat me for the R100 prize? Check it out!`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(shareText);
      setCopiedShare(true);
      showToast('Scorecard copied to clipboard!');
      setTimeout(() => setCopiedShare(false), 2500);
    }
  };

  const currentQ = activeQuestions[questionIndex];
  const isCorrect = selectedMain === currentQ?.correct;

  return (
    <div id="app-root">
      <AtmosphereCanvas />

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-[#10122a] border border-[var(--accent)] text-[var(--cream)] px-4 py-2 text-xs font-semibold shadow-lg shadow-[var(--accent)]/10 animate-bounce">
          {toastMessage}
        </div>
      )}

      {/* Screen 1: INTRO */}
      {screen === 'intro' && (
        <main className="screen-shell intro-shell">
          <div className="broadcast-line">
            <span className="live-dot" />
            <span>ONE ATTEMPT PER PLAYER & DEVICE</span>
            <span className="broadcast-rule" />
            <span>5 PICKS + 1 CHAOS ROUND</span>

            <button
              type="button"
              onClick={handleToggleSound}
              className="sound-toggle-btn"
              title={soundOn ? 'Sound On' : 'Sound Muted'}
            >
              {soundOn ? <Volume2 size={13} /> : <VolumeX size={13} />}
              <span>{soundOn ? 'SFX ON' : 'SFX OFF'}</span>
            </button>
          </div>

          <section className="intro-grid">
            <div className="intro-copy">
              <div className="wordmark">
                <span className="wordmark-dot" />
                <span>I KNOW YOU</span>
                <em>OR DO I?</em>
              </div>

              <p className="intro-kicker">WOULD I RATHER / HOW WELL DO YOU KNOW ME?</p>
              <h1>
                Read the vibe.<br />
                <strong>Lock it in.</strong>
              </h1>
              <p className="intro-description">
                Five personal picks with scrambled choices. Then a 30-second Halloween tiebreaker blitz where the calendar fights back.
                Strictly one attempt per player and device. Highest score wins the R100 prize!
              </p>

              {/* Strict Device & Player Name Lock */}
              {deviceAttempt ? (
                <div className="bg-[rgba(16,18,42,0.92)] border border-amber-500/50 p-5 max-w-[590px] shadow-lg shadow-amber-500/10 mb-4">
                  <div className="flex items-center gap-2 text-amber-400 text-xs font-bold tracking-widest uppercase mb-2">
                    <Lock size={15} />
                    <span>Single Attempt Used on This Device</span>
                  </div>
                  <p className="text-sm text-[var(--cream)] mb-1">
                    You have already logged your competitive run as <strong>{deviceAttempt.name}</strong> with a final score of{' '}
                    <strong className="text-[var(--accent)] font-mono text-base">{deviceAttempt.score} pts</strong>.
                  </p>
                  <p className="text-xs text-[var(--muted)] mb-4">
                    To maintain fair competition for the R100 bounty, only one run is permitted per player and device.
                  </p>
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={() => {
                      sound.playSelect();
                      setPlayerName(deviceAttempt.name);
                      setFinalScore(deviceAttempt.score);
                      setMainScore(deviceAttempt.mainScore);
                      setBlitzScore(deviceAttempt.blitzScore);
                      setTimeBonus(deviceAttempt.timeBonus);
                      setLastEntryId(deviceAttempt.entryId);
                      setScreen('results');
                    }}
                  >
                    VIEW MY SCORECARD & RANK <ArrowUpRight size={18} />
                  </button>
                </div>
              ) : (
                <form onSubmit={handleStartGame} className="name-form">
                  <label htmlFor="player-name">PLAYER NAME / ONE ATTEMPT PER PLAYER & DEVICE</label>
                  <div className="name-row">
                    <input
                      id="player-name"
                      ref={nameInputRef}
                      maxLength={18}
                      autoComplete="off"
                      placeholder="Type your unique name"
                      value={playerName}
                      onChange={(e) => setPlayerName(e.target.value)}
                    />
                    <button className="primary-btn" type="submit">
                      START QUIZ <ArrowUpRight size={18} />
                    </button>
                  </div>
                  {notice && (
                    <p className="form-notice">
                      <AlertCircle size={14} />
                      <span>{notice}</span>
                    </p>
                  )}
                </form>
              )}

              <div className="rule-row">
                <span>100 PTS / MAIN ANSWER</span>
                <span>+ SPEED BONUS</span>
                <span>ONE ATTEMPT PER DEVICE</span>
              </div>

              <div className="prize-callout">
                WINNER TAKES <strong>R100</strong>
              </div>
            </div>

            <div className="intro-art" aria-label="Quiz preview collage">
              <div className="art-stamp">
                ON AIR<br />
                <b>01:00</b>
              </div>
              <div className="art-card art-card-a">
                <img
                  src="/images/teaser-garage.jpg"
                  alt="Garage question category"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/src/assets/images/intro_garage_teaser_1792576652045.jpg';
                  }}
                />
                <span>GARAGE / 01</span>
              </div>
              <div className="art-card art-card-b">
                <img
                  src="/images/teaser-flavor.jpg"
                  alt="Flavor question category"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/src/assets/images/intro_flavor_teaser_1792576651995.jpg';
                  }}
                />
                <span>FLAVOR / 02</span>
              </div>
              <div className="art-card art-card-c">
                <img
                  src="/images/teaser-gaming.jpg"
                  alt="Gaming question category"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/src/assets/images/intro_gaming_teaser_1792576652837.jpg';
                  }}
                />
                <span>PLAY / 04</span>
              </div>
              <div className="art-ghost">?</div>
            </div>
          </section>

          <section className="intro-bottom">
            <div>
              <span className="bottom-label">THE BRIEF</span>
              <p>One device. One name. One run. Highest total score wins the R100 prize. Standings update live across all competitors.</p>
            </div>
            <LeaderboardView
              label="CURRENT STANDINGS / R100 PRIZE"
              entries={entries}
              lastEntryId={lastEntryId || (deviceAttempt ? deviceAttempt.entryId : null)}
              liveStatus={liveStatus}
              recentEntryId={recentEntryId}
            />
          </section>
        </main>
      )}

      {/* Screen 2: QUIZ ROUNDS (1 - 5) */}
      {screen === 'quiz' && currentQ && (
        <main className={`screen-shell question-shell theme-${currentQ.theme}`}>
          <header className="game-topbar">
            <div className="mini-brand">
              <span className="live-dot" /> I KNOW YOU / OR DO I?
            </div>
            <div className="progress-wrap">
              <span>MAIN GAME</span>
              <div className="progress-track">
                <i style={{ width: `${((questionIndex + 1) / activeQuestions.length) * 100}%` }} />
              </div>
              <b className="tabular-nums">0{questionIndex + 1} / 05</b>
            </div>
            <div className="score-ticker">
              <span>SCORE</span>
              <b className="tabular-nums">{mainScore}</b>
            </div>
          </header>

          <section className="question-layout">
            <div className="question-media">
              <div className="media-meta">
                <span>{currentQ.eyebrow}</span>
                <span className="media-index tabular-nums">0{questionIndex + 1}</span>
              </div>

              <div className="media-frame media-slate" aria-hidden="true">
                <div className="slate-grid" />
                <div className="slate-number tabular-nums">0{questionIndex + 1}</div>
                <div className="media-glow" />
                <div className="media-caption">PICK YOUR SIGNAL</div>
              </div>

              <div className="media-footer">
                <span>QUESTION {questionIndex + 1} OF 5</span>
                <span className="pulse-line" />
                <span>INSTANT REVEAL</span>
              </div>
            </div>

            <div className="question-copy">
              <div className="section-kicker">
                <span className="kicker-mark">✦</span>
                {currentQ.eyebrow}
              </div>

              <h1>{currentQ.title}</h1>
              <p className="question-prompt">{currentQ.prompt}</p>
              <p className="question-note">{currentQ.note}</p>

              <div className={`choice-grid choice-count-${currentQ.choices.length}`}>
                {currentQ.choices.map((choice: Choice, idx: number) => {
                  const isSelected = selectedMain === choice.id;
                  const isChoiceCorrect = currentQ.correct === choice.id;
                  let status = '';
                  if (mainAnswered) {
                    if (isChoiceCorrect) status = 'is-correct';
                    else if (isSelected) status = 'is-wrong';
                    else status = 'is-dimmed';
                  }

                  return (
                    <button
                      key={choice.id}
                      type="button"
                      className={`choice-card ${status} ${isSelected ? 'is-selected' : ''}`}
                      onClick={() => handleChooseMain(choice.id)}
                      disabled={mainAnswered}
                      aria-pressed={isSelected}
                    >
                      <span className="choice-number tabular-nums">0{idx + 1}</span>
                      <span className="choice-visual">
                        {choice.src ? (
                          <img
                            src={choice.src}
                            alt={choice.alt || choice.label}
                            onError={(e) => {
                              const parent = (e.target as HTMLElement).parentElement;
                              if (parent) {
                                parent.innerHTML = `<span class="symbol-visual">✦</span>`;
                              }
                            }}
                          />
                        ) : (
                          <span className="symbol-visual">{choice.symbol || '?'}</span>
                        )}
                      </span>
                      <span className="choice-label">{choice.label}</span>
                      {mainAnswered ? (
                        <span className="choice-state">
                          {isChoiceCorrect ? 'ANSWER' : isSelected ? 'YOUR PICK' : ''}
                        </span>
                      ) : (
                        <span className="choice-arrow">↗</span>
                      )}
                    </button>
                  );
                })}
              </div>

              {mainAnswered ? (
                <>
                  <div className={`answer-reveal ${isCorrect ? 'is-correct' : 'is-wrong'}`}>
                    <div className="reveal-icon">{isCorrect ? '✓' : '×'}</div>
                    <div>
                      <strong>{isCorrect ? 'CORRECT // +100' : 'NOT QUITE // 0 POINTS'}</strong>
                      <span>{currentQ.reveal}</span>
                    </div>
                  </div>

                  <button type="button" className="next-btn" onClick={handleNextMain}>
                    <span>{questionIndex === activeQuestions.length - 1 ? 'ENTER THE CHAOS ROUND' : 'NEXT QUESTION'}</span>
                    <span>→</span>
                  </button>
                </>
              ) : (
                <div className="select-hint">
                  <span>SELECT ONE</span>
                  <span>USE 1 / 2 KEYS TOO</span>
                </div>
              )}
            </div>
          </section>

          <footer className="game-footer">
            <span>THE PERSONAL QUIZ TRANSMISSION</span>
            <span>NO SKIPS / NO HEDGING</span>
          </footer>
        </main>
      )}

      {/* Screen 3: BLITZ INTRO (Answers Strictly Hidden) */}
      {screen === 'blitz-intro' && (
        <main className="screen-shell blitz-intro-shell">
          <div className="blitz-grid-lines" />
          <div className="broadcast-line blitz-broadcast">
            <span className="live-dot" /> SPECIAL TRANSMISSION / HALLOWEEN EDITION
          </div>

          <section className="blitz-intro-card">
            <div className="blitz-kicker">THE FINAL BLITZ</div>
            <div className="blitz-number tabular-nums">
              30<span>SEC</span>
            </div>
            <h1>
              TIEBREAKER<br />
              <strong>BLITZ</strong>
            </h1>
            <p>
              My birthday is on Halloween. Two calendar facts. One ticking score multiplier. Lock both answers before
              the clock disappears. Highest score wins R100.
            </p>

            <div className="blitz-rules">
              <span>CALENDAR PICKS = +150 EACH</span>
              <span>SPEED BONUS = +10 / SEC</span>
              <span>30 SEC TIMER</span>
            </div>

            <div className="prize-callout">
              ONE CHANCE. <strong>R100</strong> ON THE LINE.
            </div>

            <button type="button" className="primary-btn blitz-start" onClick={handleStartBlitz}>
              START THE CHAOS <ArrowUpRight size={18} />
            </button>
          </section>

          <div className="blitz-side-note">
            <span className="tabular-nums">OCT 31</span>
            <b>THE DATE<br />IS THE CLUE.</b>
          </div>
        </main>
      )}

      {/* Screen 4: BLITZ ACTIVE */}
      {screen === 'blitz' && (
        <main className="screen-shell blitz-shell">
          <header className="game-topbar blitz-topbar">
            <div className="mini-brand">
              <span className="live-dot" /> CHAOS ROUND / LIVE
            </div>

            <div className="timer-block">
              <span className="timer-label">TIME LEFT</span>
              <div
                className="timer-ring"
                data-urgent={blitzRemaining <= 10 ? 'true' : 'false'}
                style={{ '--timer-progress': `${(blitzRemaining / 30) * 100}%` } as React.CSSProperties}
              >
                <span className="timer-number tabular-nums">{blitzRemaining}</span>
                <small>SEC</small>
              </div>
            </div>

            <div className="score-ticker">
              <span>BASE SCORE</span>
              <b className="tabular-nums">{mainScore}</b>
            </div>
          </header>

          <section className="blitz-content">
            <div className="blitz-headline">
              <div>
                <span className="section-kicker">HALLOWEEN / CALENDAR ATTACK</span>
                <h1>Make the date count.</h1>
              </div>
              <span className="blitz-tip">ANSWER BOTH<br />THEN LOCK IN</span>
            </div>

            <div className="blitz-question-grid">
              {activeBlitzQuestions.map((q, qIndex) => {
                const selected = blitzSelections[qIndex];
                return (
                  <article key={q.eyebrow} className={`blitz-question-card ${selected ? 'has-selection' : ''}`}>
                    <div className="blitz-card-top">
                      <span>{q.eyebrow}</span>
                      <b className="tabular-nums">0{qIndex + 1}</b>
                    </div>
                    <h2>{q.title}</h2>
                    <p>{q.prompt}</p>

                    <div className="blitz-options">
                      {q.choices.map((choice: Choice, cIndex: number) => {
                        const isSelected = selected === choice.id;
                        return (
                          <button
                            key={choice.id}
                            type="button"
                            className={`blitz-option ${isSelected ? 'is-selected' : ''}`}
                            onClick={() => handleChooseBlitz(qIndex, choice.id)}
                            aria-pressed={isSelected}
                          >
                            <span className="tabular-nums">0{cIndex + 1}</span>
                            {choice.label}
                          </button>
                        );
                      })}
                    </div>
                    <div className="blitz-card-foot">{q.note}</div>
                  </article>
                );
              })}
            </div>

            <div className="blitz-actions">
              <span>{blitzSelections.every(Boolean) ? 'Both answers ready.' : 'Pick one answer in each card.'}</span>
              <button
                type="button"
                className="lock-btn"
                disabled={!blitzSelections.every(Boolean)}
                onClick={() => handleFinishBlitz()}
              >
                LOCK ANSWERS ↗
              </button>
            </div>
          </section>
        </main>
      )}

      {/* Screen 5: RESULTS */}
      {screen === 'results' && (
        <main className="screen-shell results-shell">
          <header className="game-topbar">
            <div className="mini-brand">
              <span className="live-dot" /> TRANSMISSION COMPLETE
            </div>
            <div className="result-tag">FINAL SCORECARD / ONE ATTEMPT USED</div>
            <div className="score-ticker">
              <span>RANKING</span>
              <b className="tabular-nums">#{getRank()}</b>
            </div>
          </header>

          <section className="results-layout">
            <div className="result-hero">
              <div className="result-orbit orbit-a" />
              <div className="result-orbit orbit-b" />
              <span className="result-kicker">
                {mainScore === 500 ? 'PERFECT MAIN GAME' : 'THE SIGNAL HAS SPOKEN'}
              </span>
              <div className="final-score tabular-nums">{finalScore}</div>
              <span className="points-label">TOTAL POINTS</span>
              <div className="prize-callout">
                WINNER TAKES <strong>R100</strong>
              </div>

              <h1>
                {playerName || (deviceAttempt ? deviceAttempt.name : 'PLAYER')},<br />
                <strong>you know the vibe.</strong>
              </h1>

              <div className="result-stats">
                <div>
                  <span>MAIN GAME</span>
                  <b className="tabular-nums">
                    {mainScore}
                    <small> / 500</small>
                  </b>
                </div>
                <div>
                  <span>BLITZ SCORE</span>
                  <b className="tabular-nums">{blitzScore}</b>
                </div>
                <div>
                  <span>SPEED BONUS</span>
                  <b className="tabular-nums">+{timeBonus}</b>
                </div>
              </div>

              <div className="flex items-center gap-4 flex-wrap">
                <button type="button" className="primary-btn" onClick={handleReturnHome}>
                  STANDINGS & HOME <ArrowUpRight size={18} />
                </button>
                <button
                  type="button"
                  onClick={handleShareScore}
                  className="inline-flex items-center gap-2 border border-white/20 bg-white/5 hover:bg-white/10 text-xs font-bold uppercase tracking-wider py-3.5 px-4 text-[#fff5dd] transition-all cursor-pointer"
                >
                  {copiedShare ? <Check size={16} className="text-emerald-400" /> : <Share2 size={16} />}
                  <span>{copiedShare ? 'COPIED TO CLIPBOARD' : 'SHARE SCORE'}</span>
                </button>
              </div>
            </div>

            <div className="results-board">
              <div className="board-heading">
                <span>LEADERBOARD / LIVE MULTIPLAYER</span>
                <b>
                  R100 PRIZE / {mainCorrectCount}/{activeQuestions.length} CORRECT
                </b>
              </div>

              <LeaderboardView
                label="TOP SIGNALS / R100 PRIZE"
                entries={entries}
                lastEntryId={lastEntryId || (deviceAttempt ? deviceAttempt.entryId : null)}
                liveStatus={liveStatus}
                recentEntryId={recentEntryId}
              />

              <div className="score-method">
                <span>ONE ATTEMPT RULE</span>
                <p>
                  This device has completed its official attempt. The highest verified score on the global board wins
                  the R100 bounty!
                </p>
              </div>
            </div>
          </section>
        </main>
      )}
    </div>
  );
}

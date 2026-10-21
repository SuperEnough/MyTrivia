/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Screen, Theme, BoardEntry, Choice } from './types';
import { questions, blitzQuestions } from './data';
import { sound } from './audio';
import { AtmosphereCanvas } from './components/AtmosphereCanvas';
import { LeaderboardView } from './components/LeaderboardView';
import { Volume2, VolumeX, Share2, Check, AlertCircle, ArrowUpRight } from 'lucide-react';

const LOCAL_STORAGE_KEY = 'how-well-do-you-know-me.leaderboard.v3';

export default function App() {
  const [screen, setScreen] = useState<Screen>('intro');
  const [playerName, setPlayerName] = useState<string>('');
  const [questionIndex, setQuestionIndex] = useState<number>(0);
  const [selectedMain, setSelectedMain] = useState<string | null>(null);
  const [mainAnswered, setMainAnswered] = useState<boolean>(false);
  const [mainScore, setMainScore] = useState<number>(0);
  const [mainCorrectCount, setMainCorrectCount] = useState<number>(0);

  // Blitz state
  const [blitzSelections, setBlitzSelections] = useState<[string | null, string | null]>([null, null]);
  const [blitzRemaining, setBlitzRemaining] = useState<number>(30);
  const [blitzDeadline, setBlitzDeadline] = useState<number>(0);
  const [blitzScore, setBlitzScore] = useState<number>(0);
  const [timeBonus, setTimeBonus] = useState<number>(0);
  const [finalScore, setFinalScore] = useState<number>(0);

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

  // Update theme on body
  useEffect(() => {
    let currentTheme: Theme = 'intro' as any;
    if (screen === 'quiz') {
      currentTheme = questions[questionIndex]?.theme || 'car';
    } else if (screen === 'blitz' || screen === 'blitz-intro') {
      currentTheme = 'blitz';
    }
    document.body.dataset.theme = currentTheme;
  }, [screen, questionIndex]);

  // Focus name input on intro screen
  useEffect(() => {
    if (screen === 'intro') {
      nameInputRef.current?.focus();
    }
  }, [screen]);

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

  // Start game flow
  const handleStartGame = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleaned = playerName.trim().replace(/\s+/g, ' ').slice(0, 18);
    if (!cleaned) {
      setNotice('Drop a name first. The leaderboard needs a legend.');
      sound.playWrong();
      return;
    }

    // Check locally first
    const alreadyPlayedLocal = entries.some(entry => entry.name.toLowerCase() === cleaned.toLowerCase());
    if (alreadyPlayedLocal) {
      setNotice(`${cleaned} has already used their one chance. Try a different player name.`);
      sound.playWrong();
      return;
    }

    // Check server
    try {
      const res = await fetch(`/api/leaderboard/check?name=${encodeURIComponent(cleaned)}`);
      if (res.ok) {
        const checkData = await res.json();
        if (checkData.taken) {
          setNotice(`${cleaned} has already used their one chance. Try a different player name.`);
          sound.playWrong();
          return;
        }
      }
    } catch {
      // Continue if server check has network glitch
    }

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
    const currentQ = questions[questionIndex];
    const isCorrect = id === currentQ.correct;

    setSelectedMain(id);
    setMainAnswered(true);

    if (isCorrect) {
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
    if (questionIndex === questions.length - 1) {
      setScreen('blitz-intro');
    } else {
      setQuestionIndex(prev => prev + 1);
      setSelectedMain(null);
      setMainAnswered(false);
    }
  };

  // Start Blitz
  const handleStartBlitz = () => {
    sound.playSelect();
    if (blitzTimerRef.current) clearInterval(blitzTimerRef.current);
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

  // Finish Blitz and save to Leaderboard
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

    // Scoring math
    const dayPoints = blitzSelections[0] === '304' ? 150 : blitzSelections[0] === '305' ? 50 : 0;
    const leftPoints = blitzSelections[1] === '61' ? 150 : 0;
    const bonus = currentRemaining * 10;
    const totalBlitz = dayPoints + leftPoints + bonus;
    const totalFinal = mainScore + totalBlitz;

    setBlitzScore(totalBlitz);
    setTimeBonus(bonus);
    setFinalScore(totalFinal);
    setScreen('results');

    sound.playFanfare();

    // Post to Server Sync
    const newEntryId = Date.now();
    setLastEntryId(newEntryId);

    const entryPayload: BoardEntry = {
      id: newEntryId,
      name: playerName || 'Anonymous',
      score: totalFinal,
      mainScore: mainScore,
      blitzScore: totalBlitz,
      timeBonus: bonus,
      createdAt: Date.now(),
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

    // Send to backend
    fetch('/api/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entryPayload),
    })
      .then(res => res.json())
      .then(data => {
        if (data.entries && Array.isArray(data.entries)) {
          setEntries(data.entries);
        }
      })
      .catch(() => {
        // Offline resilience handles local storage
      });
  }, [blitzDeadline, blitzSelections, mainScore, playerName]);

  // Return home / restart
  const handleReturnHome = () => {
    sound.playSelect();
    if (blitzTimerRef.current) {
      clearInterval(blitzTimerRef.current);
      blitzTimerRef.current = null;
    }
    setScreen('intro');
    setPlayerName('');
    setQuestionIndex(0);
    setSelectedMain(null);
    setMainAnswered(false);
    setNotice('');
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (screen === 'quiz') {
        const num = Number(e.key);
        if (!mainAnswered && num >= 1 && num <= questions[questionIndex].choices.length) {
          handleChooseMain(questions[questionIndex].choices[num - 1].id);
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
  }, [screen, questionIndex, mainAnswered, blitzSelections, handleFinishBlitz]);

  // Rank calculation
  const getRank = (): number => {
    const idx = entries.findIndex(e => e.id === lastEntryId);
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

  const currentQ = questions[questionIndex];
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
            <span>ONE CHANCE / R100 PRIZE</span>
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

              <p className="intro-kicker">WOULD YOU RATHER / HOW WELL DO YOU KNOW ME?</p>
              <h1>
                Read the vibe.<br />
                <strong>Lock it in.</strong>
              </h1>
              <p className="intro-description">
                Five personal picks. Immediate reveals. Then a 30-second Halloween blitz where the calendar fights back.
                Everyone gets one chance; the highest score wins R100.
              </p>

              <form onSubmit={handleStartGame} className="name-form">
                <label htmlFor="player-name">PLAYER NAME / ONE CHANCE ONLY</label>
                <div className="name-row">
                  <input
                    id="player-name"
                    ref={nameInputRef}
                    maxLength={18}
                    autoComplete="off"
                    placeholder="Type your name"
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

              <div className="rule-row">
                <span>100 PTS / MAIN ANSWER</span>
                <span>+ SPEED BONUS</span>
                <span>ONE ATTEMPT PER NAME</span>
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
              <p>One name. One run. Highest total score wins the R100 prize. Standings update live across all competitors.</p>
            </div>
            <LeaderboardView
              label="CURRENT STANDINGS / R100 PRIZE"
              entries={entries}
              lastEntryId={lastEntryId}
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
                <i style={{ width: `${((questionIndex + 1) / questions.length) * 100}%` }} />
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
                              // If image fails, show stylish fallback
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
                    <span>{questionIndex === questions.length - 1 ? 'ENTER THE CHAOS ROUND' : 'NEXT QUESTION'}</span>
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

      {/* Screen 3: BLITZ INTRO */}
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
              <span>304th = +150</span>
              <span>61 days = +150</span>
              <span>EVERY SECOND = +10</span>
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
              {blitzQuestions.map((q, qIndex) => {
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
                      {q.choices.map((choice, cIndex) => {
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
            <div className="result-tag">FINAL SCORECARD / ONE CHANCE USED</div>
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
                {playerName || 'PLAYER'},<br />
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
                  RETURN TO START <ArrowUpRight size={18} />
                </button>
                <button
                  type="button"
                  onClick={handleShareScore}
                  className="inline-flex items-center gap-2 border border-white/20 bg-white/5 hover:bg-white/10 text-xs font-bold uppercase tracking-wider py-3.5 px-4 text-[#fff5dd] transition-all"
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
                  R100 PRIZE / {mainCorrectCount}/{questions.length} CORRECT
                </b>
              </div>

              <LeaderboardView
                label="TOP SIGNALS / R100 PRIZE"
                entries={entries}
                lastEntryId={lastEntryId}
                liveStatus={liveStatus}
                recentEntryId={recentEntryId}
              />

              <div className="score-method">
                <span>ONE CHANCE RULE</span>
                <p>
                  This player name ({playerName}) has logged its single entry. The top score on the global board wins
                  the R100 prize!
                </p>
              </div>
            </div>
          </section>
        </main>
      )}
    </div>
  );
}

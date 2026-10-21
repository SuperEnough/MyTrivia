# Competitive Multiplayer Quiz & Real-Time Synced Leaderboard

Rebuild the "I Know You // Or Do I?" personal quiz and tiebreaker blitz into a production-grade, highly responsive web application featuring real-time cloud leaderboard synchronization, strict one-run-per-name competitive rules, resilient image cards ready for custom uploads, and seamless Vercel deployment.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural decisions were aligned during Phase 1 clarification:

- **Confirmed Decision 1 (Real-Time Leaderboard Synchronization)**: Implement a live cloud-synchronized leaderboard powered by Firestore with real-time listeners (`onSnapshot`), broadcasting rank shifts instantly to all connected players without manual refreshing.
- **Confirmed Decision 2 (Strict Competitive Integrity)**: Enforce a strict one-attempt-per-name policy. Duplicate names are rejected at entry with live validation against cloud standings, guaranteeing fair competition for the R100 prize.
- **Confirmed Decision 3 (Image Asset Contract & Zero-Broken-Image Resilience)**: Preserve the exact image paths from the user's TypeScript codebase (`/images/nissan-gtr-r35.jpg`, etc.) while adding polished cyberpunk/broadcast CSS-styled fallback frames so the game remains visually complete and playable before and after user image uploads.
- **Vercel Hosting Readiness**: Architecture designed with zero backend lock-in, clean environment variable bindings, and production bundling suitable for standard static/serverless Vercel hosting.

---

## 1. Overview & Core Concept

- **What It Does**: A personal, competitive trivia challenge where players test how well they know the host across 5 high-stakes questions (cars, ice cream flavor, rap hierarchy, gaming habits, mindset), followed by an intense 30-second "Halloween Blitz" tiebreaker where every remaining second awards +10 points. All scores feed into a live global leaderboard competing for an R100 bounty.
- **Target Audience / Persona**: Friends, followers, and competitive gaming groups participating in a community trivia contest on mobile or desktop browsers.
- **Key Value**: Delivers instant gratification through real-time rank updates, immediate question feedback, retro broadcast atmosphere, and zero latency across devices.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Title & Entry Flow**:
   - Player lands on the retro broadcast shell with ambient drifting particle atmosphere.
   - Live standings board shows the current top signals and points breakdown.
   - Player submits their name. The system verifies uniqueness in real time against the cloud database.
2. **Main Challenge Flow (5 Rounds)**:
   - Dynamic top bar displays question progress track, live score ticker, and broadcast status.
   - Dual-card choice layout with keyboard shortcuts (keys `1` and `2`).
   - Instant verification reveal with distinct audio-visual signals: correct choices illuminate in neon cyan (+100 pts) while incorrect picks highlight in alert crimson.
   - Enter key advances to the next question.
3. **Chaos Round / Halloween Blitz Flow**:
   - Dramatic countdown warning introduces the tiebreaker with a 30-second conic-gradient timer ring.
   - Player must answer both calendar questions simultaneously (Halloween day-of-year and remaining days).
   - Locking in locks remaining time into a speed multiplier (+10 pts per second).
4. **Scorecard & Live Standings Flow**:
   - Final results screen reveals total score, rank badge (`#1`, `#2`, etc.), main vs blitz breakdown, and speed bonus.
   - Leaderboard highlights the current player's entry among global competitors with live rank changes.

### Visual Identity & Theme

- **Aesthetic Direction**: High-energy retro-broadcast cyber aesthetic with dark velvet navy canvas, electric neon accents, and editorial typography.
- **Color Palette (60-30-10 Discipline)**:
  - *60% Neutral Canvas*: Deep midnight void (`#080917`), ink-2 container fill (`#10122a`), and textured hairline grids.
  - *30% Structural Elements*: Off-white cream prose (`#fff5dd`), muted steel labels (`#a9aac6`), and hairline border lines (`rgba(255, 245, 221, 0.16)`).
  - *10% Focal Accents*: Electric cyan (`#68f7ed`), solar orange (`#ff784d`), crimson red (`#ff5269`), and prize amber (`#ffd166`).
- **Typography & Scale**:
  - *Display / Headings*: Bold condensed display sans with tight letter-spacing for heroic broadcast punch.
  - *Body Prose*: Clean, highly legible sans-serif with comfortable line height.
  - *Data & Timers*: Monospace tabular numerals (`tabular-nums`) ensuring steady timer count and aligned leaderboard columns.
- **Component Styling**:
  - Bordered cards with isometric angle cuts, glowing corner brackets, and crisp hover states.
  - No generic pills: clean unboxed typographic metadata separated by slashes (`/`) and dots (`·`).
  - Subtle interactive audio cues using the browser Web Audio API for lock-in, tick-tock urgency, and victory chimes.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Real-Time Synchronization via Cloud Firestore**:
  - *Chosen Approach*: Direct Firestore collection listener (`onSnapshot`) on client startup and score submission.
  - *Why*: Delivers true multiplayer competitiveness—when another player finishes on their phone, the desktop leaderboard updates instantly without needing manual page reloads or polling overhead.
  - *Vercel Compatibility*: Operates cleanly on static or edge CDN deployments without requiring dedicated persistent WebSocket server infrastructure.
- **Decision 2: Atomic One-Run-Per-Name Verification**:
  - *Chosen Approach*: Normalized case-insensitive name check prior to run initialization, with server-side document keying (`leaderboard/${normalizedName}`) to prevent race conditions.
  - *Why*: Preserves the integrity of the R100 prize contest by preventing replay grinding.
- **Decision 3: Image Slot Contract with Resilient Visual Fallbacks**:
  - *Chosen Approach*: Keep `/images/${name}.jpg` path mapping from the user's codebase, backed by an error boundary (`onError`) and CSS graphic slate fallback with theme icons.
  - *Why*: Allows the user to drop image files straight into `/public/images/` at any time without code modifications, while ensuring the app looks gorgeous even if images are still being prepared.

---

## 4. Technical Architecture & Data Strategy

### System Architecture & Data Flow

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CLIENT APPLICATION                              │
│                                                                        │
│  ┌───────────────────────┐             ┌────────────────────────────┐  │
│  │   Vite + React SPA    │             │   Canvas Particle Layer    │  │
│  │  (App.tsx / main.tsx) │             │ (Atmospheric Starfield BG) │  │
│  └───────────┬───────────┘             └────────────────────────────┘  │
│              │                                                         │
│     ┌────────┴────────┬───────────────────┬───────────────────┐        │
│     ▼                 ▼                   ▼                   ▼        │
│ ┌─────────┐     ┌───────────┐     ┌──────────────┐     ┌─────────────┐ │
│ │  Intro  │     │   Quiz    │     │ Blitz / Ring │     │ Results &   │ │
│ │ Screen  │ ──► │  5 Rounds │ ──► │  30s Timer   │ ──► │ Leaderboard │ │
│ └─────────┘     └───────────┘     └──────────────┘     └─────────────┘ │
│      │                                                        ▲        │
│      │ Live Name Check                                        │        │
│      ▼                                                        │        │
│ ┌─────────────────────────────────────────────────────────────┴──────┐ │
│ │                 Leaderboard Synchronization Layer                  │ │
│ │              (Real-Time Listener & Submission Guard)               │ │
│ └─────────────────────────────┬──────────────────────────────────────┘ │
└───────────────────────────────┼────────────────────────────────────────┘
                                │
                                ▼ Real-Time WebSocket / HTTPS
                ┌───────────────────────────────┐
                │   Cloud Firestore Database    │
                │  Collection: `leaderboard`    │
                │  - Real-time `onSnapshot`     │
                │  - Atomic write on completion │
                └───────────────────────────────┘
```

### Data Model & Schema

```typescript
interface BoardEntry {
  id: string;               // Unique entry identifier (e.g. normalized player name)
  name: string;             // Display name (trimmed, 1-18 chars)
  score: number;            // Total final score (mainScore + blitzScore)
  mainScore: number;        // Points from 5 main questions (0 - 500)
  blitzScore: number;       // Points from Blitz correct answers (0 - 300)
  timeBonus: number;        // Remaining seconds * 10
  createdAt: number;        // Timestamp
}
```

### State Machine & Interactive Transition Mapping

- `intro`: Validates player name against existing entries. Displays live top-10 board.
- `quiz`: Manages index 0–4, active selection, instant feedback animation, score accumulation, and keyboard listeners (`1`, `2`, `Enter`).
- `blitz-intro`: Prepares player for the 30-second time trial; explains the tiebreaker rules and Halloween birthday lore.
- `blitz`: Runs a high-precision 100ms interval countdown, conic-gradient SVG progress ring, dual-question selection state, and automatic lock on timeout.
- `results`: Computes rank, updates cloud database atomically, highlights player row, and provides a restart action.

---

## 5. Verification Plan

- **Compilation**: Run `compile_applet` to confirm clean TypeScript bundling without errors.
- **Game Progression**: Verify full sequence from Intro $\rightarrow$ Question 1–5 $\rightarrow$ Blitz Intro $\rightarrow$ Blitz Timer $\rightarrow$ Results Scorecard.
- **Leaderboard Real-Time Sync**: Verify entries persist, sort by score descending then time bonus descending, and update instantaneously.
- **Duplicate Name Guard**: Test submitting an existing name to verify the one-chance warning message.
- **Responsive Layout**: Test on both desktop (1440px wide) and mobile viewports to ensure zero layout overlap or clipping.

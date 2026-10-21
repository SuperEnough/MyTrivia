import { Question } from './types';

export const questions: Question[] = [
  {
    theme: 'car',
    eyebrow: 'GARAGE FILE / 01',
    title: 'Which ride will I own first?',
    prompt: 'The Japanese rocket or the German track weapon?',
    note: 'Two legends. One driveway. Pick the future key fob.',
    hero: ['/images/nissan-gtr-r35.jpg', 'Nissan GT-R R35'],
    choices: [
      { id: 'nissan', label: 'Nissan GT-R R35', src: '/images/nissan-gtr-r35.jpg', alt: 'White Nissan GT-R R35' },
      { id: 'porsche', label: 'Porsche 911 GT3 RS', src: '/images/porsche-gt3-rs.jpg', alt: 'Porsche 911 GT3 RS' },
    ],
    correct: 'nissan',
    reveal: 'Nissan GT-R R35. The first dream car in the queue.',
  },
  {
    theme: 'flavor',
    eyebrow: 'FREEZER FILE / 02',
    title: 'Vanilla or chocolate?',
    prompt: 'Which scoop gets the final vote?',
    note: 'No toppings. No hedging. Just the flavor that wins every time.',
    hero: ['/images/chocolate-ice-cream.jpg', 'Chocolate ice cream'],
    choices: [
      { id: 'vanilla', label: 'Vanilla', src: '/images/vanilla-ice-cream.jpg', alt: 'Vanilla ice cream' },
      { id: 'chocolate', label: 'Chocolate', src: '/images/chocolate-ice-cream.jpg', alt: 'Chocolate ice cream' },
    ],
    correct: 'chocolate',
    reveal: 'Chocolate. Rich, decisive, and absolutely not boring.',
  },
  {
    theme: 'music',
    eyebrow: 'HEADPHONE FILE / 03',
    title: 'J. Cole is number one. Who is number two?',
    prompt: 'Drake or Kendrick Lamar?',
    note: 'This ranking is personal. The group chat may not survive it.',
    hero: ['/images/artist-b.jpg', 'Kendrick Lamar portrait'],
    choices: [
      { id: 'drake', label: 'Drake', src: '/images/artist-a.jpg', alt: 'Drake portrait' },
      { id: 'kendrick', label: 'Kendrick Lamar', src: '/images/artist-b.jpg', alt: 'Kendrick Lamar portrait' },
    ],
    correct: 'kendrick',
    reveal: 'Kendrick Lamar. J. Cole at #1, Kendrick holding #2.',
  },
  {
    theme: 'game',
    eyebrow: 'CONTROLLER FILE / 04',
    title: 'Which game owns my free time?',
    prompt: 'Drop into Fortnite or queue up EA SPORTS FC?',
    note: 'One is chaos from the sky. The other is a 90-minute grudge match.',
    hero: ['/images/fortnite.jpg', 'Fortnite cover art'],
    choices: [
      { id: 'fortnite', label: 'Fortnite', src: '/images/fortnite.jpg', alt: 'Fortnite cover art' },
      { id: 'fc', label: 'EA SPORTS FC / FIFA', src: '/images/ea-fc-fifa.jpg', alt: 'EA SPORTS FC FIFA football art' },
    ],
    correct: 'fortnite',
    reveal: 'Fortnite. The island wins this round.',
  },
  {
    theme: 'mind',
    eyebrow: 'MINDSET FILE / 05',
    title: 'Am I esoteric or exoteric?',
    prompt: 'Do I keep the signal private, or put it on the main stage?',
    note: 'Last main-game pick. Trust your read of the person behind the quiz.',
    hero: ['/images/artist-a.jpg', 'A mysterious portrait'],
    choices: [
      { id: 'esoteric', label: 'Esoteric', symbol: '✦' },
      { id: 'exoteric', label: 'Exoteric', symbol: '◉' },
    ],
    correct: 'esoteric',
    reveal: 'Esoteric. The deeper meaning stays in the inner circle.',
  },
];

export const blitzQuestions: Question[] = [
  {
    theme: 'blitz',
    eyebrow: 'HALLOWEEN CALENDAR / A',
    title: 'Which day of the year is Halloween?',
    prompt: 'In a standard year, October 31st is the…',
    note: 'The calendar is watching. Choose carefully.',
    hero: ['/images/artist-a.jpg', 'Halloween night portrait'],
    choices: [
      { id: '305', label: '305th' },
      { id: '303', label: '303rd' },
      { id: '304', label: '304th' },
    ],
    correct: '304',
    reveal: '304th day of a standard year.',
  },
  {
    theme: 'blitz',
    eyebrow: 'HALLOWEEN CALENDAR / B',
    title: 'How many days are left after Halloween?',
    prompt: 'November plus December leaves…',
    note: 'One last number before the clock eats your bonus.',
    hero: ['/images/chocolate-ice-cream.jpg', 'Dark Halloween texture'],
    choices: [
      { id: '62', label: '62 days' },
      { id: '60', label: '60 days' },
      { id: '61', label: '61 days' },
    ],
    correct: '61',
    reveal: '61 days remain after October 31st.',
  },
];

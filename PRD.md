# Spectrum — Product Requirements Document

**Version:** 2.0  
**Status:** Approved  
**Supersedes:** PRD v1.0  
**Changes in v2.0:** Core mechanic changed from drag-and-drop puzzle to progressive artwork reveal via trivia. Puzzle piece assets removed from scope. Question/answer system added.

---

## Mission

Spectrum is an interactive gallery experience celebrating LGBTQIA+ identity, community, and belonging through art and discovery.

Players answer approachable questions about LGBTQIA+ history and culture. Each correct answer reveals more of a restored artwork. Wrong answers still reveal the art — and provide the correct answer with context. No punishment. No losing. Only discovery.

---

## Core Experience

```
Landing Page
  → Gallery Intro (context for the artwork and theme)
    → Reveal Experience (questions + progressive artwork reveal)
      → Lesson Screen (educational content, full artwork displayed)
        → Next Gallery or Final Screen
```

Five galleries total:

1. **Gallery 1 — Identity** (Sunrise)
2. **Gallery 2 — Community** (The Gathering)
3. **Gallery 3 — Expression** (Many Selves)
4. **Gallery 4 — Progress** (The Tapestry)
5. **Final — Belonging** (Belonging) — no questions, full artwork reveal only

---

## The Reveal Mechanic

Each gallery has **4 questions**. The artwork starts hidden behind a dark overlay divided into 4 sections. Each question answered — right or wrong — removes one section of the overlay, revealing that portion of the artwork underneath.

By the final question, the full artwork is visible.

### On Correct Answer
- The corresponding section of the overlay fades away (Framer Motion)
- A brief positive confirmation displays ("That's right.")
- Player advances to next question automatically after 1.5 seconds

### On Wrong Answer
- The corresponding section of the overlay still fades away
- The correct answer is highlighted
- An explanation displays (2-3 sentences of context)
- Player advances to next question after 3 seconds (longer to allow reading)

### No punishment. No score. No timer. No losing.

---

## Questions

### Format
Multiple choice. 4 options per question. One correct answer.

### Tone
Approachable and inviting. These are discovery questions, not tests. Common knowledge or culturally familiar topics. A player who knows nothing about LGBTQIA+ history should feel curious, not intimidated.

### Content source
All question content lives in `src/data/galleries.ts`. Questions, options, correct answer index, and explanation for each question.

---

## Screens

### Landing Page (`/`)
- Full viewport background: `public/artwork/landing-page.png`
- Title: "Spectrum"
- Tagline and description
- "BEGIN RESTORATION" button → navigates to `/gallery/1`
- No nav, no chrome

### Gallery Intro (`/gallery/:id`)
- Gallery title and theme introduction
- Brief description of the artwork and its context
- "Enter Gallery" button → navigates to `/reveal/:id`

### Reveal Experience (`/reveal/:id`)
- Artwork displayed full screen with dark overlay divided into 4 sections
- Question panel below or overlaid at bottom
- Multiple choice options (A, B, C, D)
- On answer: overlay section fades, feedback displays
- Progress indicator (Question 1 of 4)
- After question 4: "Continue" button → navigates to `/lesson/:id`

### Lesson Screen (`/lesson/:id`)
- Full artwork displayed, no overlay
- Educational copy for the gallery (sourced from `src/data/galleries.ts`)
- Artist/creation credit
- "Continue" button → next gallery or `/final`

### Final Screen (`/final`)
- Belonging artwork displayed
- Closing copy about the full journey
- "View Credits" button → `/credits`

### Credits (`/credits`)
- Game title
- Creator credit: "AI Assisted. Human Approved. Powered by NLP."
- "Play Again" button → `/`

---

## Routes

```
/                  Landing Page
/gallery/:id       Gallery Intro
/reveal/:id        Reveal Experience
/lesson/:id        Lesson Screen
/final             Final Screen
/credits           Credits
```

Note: `lesson` is a new route added in v2.0. Add `src/routes/lesson.$id.tsx` to the scaffold.

---

## Data Shape

All gallery content lives in `src/data/galleries.ts`.

```typescript
type Question = {
  question: string;
  options: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
  explanation: string;
};

type Gallery = {
  id: string;
  title: string;
  theme: string;
  introText: string;
  artworkPath: string;      // e.g. "public/artwork/gallery-1-sunrise.png"
  questions: Question[];    // exactly 4
  lessonText: string;
  lessonCredit: string;
  nextGallery: string | null; // null for gallery 4
};
```

---

## Scope

### MUST Build
- Landing page
- Gallery intro screen
- Reveal experience with 4 questions per gallery
- Progressive overlay reveal (CSS + Framer Motion)
- Correct/wrong answer feedback with explanation
- Lesson screen
- Final screen
- Credits screen
- All 5 galleries wired with real content

### STUB — Do Not Build
- Audio
- Animations beyond overlay reveal and basic transitions
- Social sharing
- Save/resume progress

### NEVER Build
- User accounts
- Authentication
- Databases
- Scores
- Timers
- Leaderboards
- Multiplayer

---

## Accessibility

- Semantic HTML throughout
- All interactive elements keyboard accessible
- `prefers-reduced-motion` respected — skip Framer Motion transitions when set
- WCAG AA contrast minimum
- Answer options are buttons, not divs

---

## Definition of Done

A player can:
1. Enter Spectrum from the landing page
2. Move through all 5 galleries
3. Answer questions and watch the artwork reveal
4. Read the lesson for each gallery
5. Reach the final screen and credits

Without errors. In under 15 minutes.

---

*AI Assisted. Human Approved. Powered by NLP.*

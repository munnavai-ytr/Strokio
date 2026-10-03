# DrawAlong - Step-by-Step Drawing Lessons from Any Photo

DrawAlong transforms real photos into beginner-friendly, animated step-by-step drawing lessons with synchronized voice narration, an AR camera tracing overlay, and AI-powered paper drawing feedback.

---

## 🌟 Key Features

### 1. AI Lesson Engine & Vector Geometry (Push 2)
- **Pedagogical Breakdown**: Gemini analyzes the uploaded photo as a warm, patient drawing teacher, breaking it down into structured teaching steps (proportions, big shapes, secondary forms, contours, details, texture, and shading).
- **Pure-JS Vector Tracing**: Layered Potrace & sharp pipeline generates contour, detail, and luminance shading SVG paths capped at ~25,000 points for smooth performance.
- **Pedagogical Composition**: Generates proportion guides (centerlines, rule of thirds, block-in primitives) and maps vector paths to steps based on spatial centroids.
- **Voice Narration**: Gemini TTS generates teacher audio in Bengali (বাংলা) or English, with automatic browser Web Speech synthesis fallback.
- **Upstash Rate Limiting**: Enforces burst limits, daily UTC quotas (`DAILY_LESSON_LIMIT`), narration limits, and global concurrency guards.

### 2. Animated Drawing Player (Push 3)
- **60fps / 30fps Master Clock**: `requestAnimationFrame` drives stroke-dasharray and stroke-dashoffset per path in order. Only the active step animates; completed steps remain static layers via direct DOM refs without triggering React re-renders.
- **Pencil Tip Follower**: Dynamic marker tracks drawing strokes using `getPointAtLength()` on the active path.
- **Follow Mode & Auto Mode**: Follow mode pauses after each step with teacher tip, instructions, and common mistake card; Auto mode plays continuously.
- **Speed & Narration Pacing**: Speed controls (0.5x, 0.75x, 1x, 1.5x, 2x) with audio synchronization clamping playback rate between 0.7x and 1.6x.
- **Overlays**: Grid (Rule of Thirds / 4x4), Reference photo ghost with opacity slider, and live rear Camera AR overlay (`getUserMedia`).
- **Screen Wake Lock**: Prevents phone screens from sleeping while drawing.
- **State Persistence**: Debounced sync to `lesson_progress` table allows resuming wherever you left off.

### 3. AI Drawing Feedback (Push 3)
- **Paper Drawing Review**: Take or upload a photo of your paper sketch (`POST /api/lessons/[id]/feedback`).
- **Structured Mentor Evaluation**: Gemini analyzes your drawing against the original reference and lesson steps, returning warm, constructive advice across 6 core areas:
  - Proportions & Scale
  - Line Quality & Confidence
  - Shape Accuracy
  - Features & Details
  - Shading & Values
  - Placement & Composition
- **Encouragement & Next Challenge**: Uplifting summary, key strengths, actionable practice tips, and next creative challenge without arbitrary numerical grades.
- **Attempt History**: Browse past attempts with side-by-side reference comparison.

### 4. Low-End Performance & Offline Support (Push 3)
- **Auto Hardware Detection**: Detects `hardwareConcurrency <= 4`, `deviceMemory <= 2`, `saveData`, and `prefers-reduced-motion`.
- **Performance Tiers**: Auto, Standard, or Lite mode in Settings. Lite mode caps animations at 30fps, replaces stroke rendering on shade paths with fast fades, and eliminates heavy blur/glow filters.
- **Offline Lessons**: "Save for offline" caches lesson data, photo assets, and voice narration audio in the Cache API with storage tracking and offline badges.

---

## 🚀 Setup Instructions

### 1. Supabase Setup & Migrations
1. Open your project at [supabase.com](https://supabase.com).
2. In the **SQL Editor**, run the migrations in order:
   - `supabase/schema.sql`: Base profiles, lessons, lesson_steps, feedback, and storage buckets.
   - `supabase/migration_002.sql`: Stage progress, dimensions, narrations bucket, and audio metadata.
   - `supabase/migration_003.sql`: `lesson_progress` table with RLS and `feedback.status`.

### 2. Configure Authentication
1. In Supabase Dashboard -> **Authentication** -> **URL Configuration**:
   - Set Site URL to your app's domain (e.g., `http://localhost:3000`).
   - Add Redirect URLs: `http://localhost:3000/auth/callback`
2. Enable Google OAuth provider or use Email Magic Links.

### 3. Environment Variables
Configure your server environment variables in `.env.local` (see `.env.example`):

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Gemini AI Engine (GEMINI_API_KEY required; models & voice optional with safe defaults)
GEMINI_API_KEY="your-gemini-api-key"
# GEMINI_ANALYSIS_MODEL="gemini-2.5-flash"       # Optional (Default: "gemini-2.5-flash", Fallback: "gemini-2.5-flash-lite")
# GEMINI_TTS_MODEL="gemini-2.5-flash-preview-tts" # Optional (Default: "gemini-2.5-flash-preview-tts", Fallback: "gemini-2.5-pro-preview-tts")
# GEMINI_TTS_VOICE="Kore"                         # Optional (Default: "Kore")

# Upstash Redis & Rate Limiting (Optional)
UPSTASH_REDIS_REST_URL="https://your-redis-instance.upstash.io"
UPSTASH_REDIS_REST_TOKEN="your-upstash-token"
# DAILY_LESSON_LIMIT=3                             # Optional (Default: 3)

# App Host URL
APP_URL="http://localhost:3000"
```

---

## 🧪 Testing

Run the automated test suite covering geometry math, player timing & pacing algorithms, and feedback validation schemas:

```bash
npm test
```

---

## ✅ QA Checklist

Use this checklist to verify full end-to-end functionality:

- [ ] **Upload**: Drag-and-drop or select an image on the Home page, choose difficulty (Easy / Medium / Detailed) and language (English / Bengali), and verify upload progress.
- [ ] **Lesson Pipeline**: Observe real-time stage progression (*Analyzing photo* -> *Tracing shapes* -> *Planning steps* -> *Ready*) without UI freezing.
- [ ] **Drawing Player**:
  - [ ] Tap Play/Pause or hit `Space`.
  - [ ] Observe the pencil tip following the vector lines as they draw.
  - [ ] In Follow mode, verify the step card appears with instructions, tips, and common mistakes.
  - [ ] Test Next/Previous navigation via buttons or arrow keys.
  - [ ] Test playback speed adjustments (0.5x, 0.75x, 1x, 1.5x, 2x).
- [ ] **Voice Narration**: Verify voice narration plays for each step, prefetches the next step, and falls back to Web Speech synthesis if offline or when TTS is unavailable.
- [ ] **Camera & Overlays**:
  - [ ] Toggle Rule of Thirds and 4x4 grid lines.
  - [ ] Adjust the reference photo ghost slider to trace over the photo.
  - [ ] Enable the AR camera overlay to align paper drawings under the rear camera.
- [ ] **AI Feedback**:
  - [ ] On lesson completion, tap "Upload my drawing for feedback".
  - [ ] Upload a photo of your sketch; observe AI analysis with strengths, improvement cards, and next challenges.
  - [ ] Review attempt history tab.
- [ ] **Offline Support**:
  - [ ] Tap "Save for offline" on any ready lesson.
  - [ ] Toggle offline in DevTools; verify the lesson, photo, and voice audio remain playable.
- [ ] **Themes**: Toggle Light, Dark, and System modes in the header or Settings; verify no theme flashing on page reload.
- [ ] **Security & Logout**: Test signing out in Settings; verify private lessons and storage cannot be accessed unauthenticated.

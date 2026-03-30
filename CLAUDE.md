@AGENTS.md

# CLAUDE.md — Soon ATL Carpool App

## Project Overview

Soon ATL is a carpool coordination PWA for a college student organization in Atlanta. Every Friday there's an event, and this app replaces manual Google Forms + spreadsheet workflows for organizing driver/rider assignments. Users submit their carpool preferences (driver or rider, pickup address, available seats), and organizers run a matching algorithm to generate optimal carpools.

**Target platform:** Mobile-first web app (PWA). Most users open event links on their phones. Installable on iOS via Safari "Add to Home Screen."

**Live on Vercel (free tier).** Supabase handles auth + database + realtime.

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 16.2.1 |
| Language | TypeScript (strict mode) | ^5 |
| React | React + React DOM | 19.2.4 |
| Styling | Tailwind CSS | ^4 |
| UI Library | shadcn/ui (`base-maia` style) | ^4.1.0 |
| UI Primitives | @base-ui/react | ^1.3.0 |
| Icons | @hugeicons/react + @hugeicons/core-free-icons | ^1.1.6 / ^4.0.0 |
| Animation | motion (Framer Motion) | ^12.38.0 |
| Database + Auth | Supabase (PostgreSQL, Google OAuth, Realtime) | @supabase/supabase-js ^2.100.0, @supabase/ssr ^0.9.0 |
| Maps | @react-google-maps/api | ^2.20.8 |
| Push Notifications | web-push (VAPID) | ^3.6.7 |
| Drag & Drop | @dnd-kit/core + @dnd-kit/sortable | ^6.3.1 / ^10.0.0 |
| Date Utilities | date-fns | ^4.1.0 |
| Date Picker | react-day-picker | ^9.14.0 |
| CSS Utilities | clsx, tailwind-merge, class-variance-authority | ^2.1.1, ^3.5.0, ^0.7.1 |
| Linting | ESLint + eslint-config-next | ^9 / 16.2.1 |
| Hosting | Vercel | free tier |

---

## Architecture

### Directory Layout

```
app/                           # Next.js App Router
├── layout.tsx                 # Root layout: fonts, FluidWaveLoader, BottomNavServer
├── page.tsx                   # Home: landing + event card + carpool assignments view
├── globals.css                # Tailwind config, custom variants (tall, xtall), keyframes
├── (dashboard)/dashboard/     # Auth-gated organizer pages (route group)
│   ├── layout.tsx             # Auth check + redirect
│   ├── page.tsx               # Active event management + stats
│   ├── events/[id]/page.tsx   # Event detail with responses list
│   ├── members/page.tsx       # Admin members list
│   └── past-events/page.tsx   # Past events archive
├── auth/callback/route.ts     # Supabase OAuth callback handler
├── event/[id]/page.tsx        # Public event form (submit carpool preference)
├── profile/page.tsx           # User profile settings
└── api/                       # 16 API routes (see below)
components/
├── ui/                        # shadcn/ui primitives (22 files)
├── forms/                     # EventForm, ProfileForm
├── navigation/                # BottomNav (client), BottomNavServer (server)
├── dashboard/                 # Organizer UI: CarpoolAssignments, CarpoolAssistance, etc.
└── *.tsx                      # Shared components (ActiveEventCard, SubmittedEventCard, etc.)
lib/
├── supabase/client.ts         # Browser Supabase client (createBrowserClient)
├── supabase/server.ts         # Server client (RLS-bound) + Admin client (bypasses RLS)
├── supabase/middleware.ts     # Session refresh for proxy.ts
├── matching/algorithm.ts      # Carpool matching: greedy + local search optimization (726 lines)
├── google-maps/constants.ts   # Maps library list
├── google-maps/distance-matrix.ts  # Server-side geocoding + Distance Matrix API
├── notifications/push.ts      # VAPID push notification sending
├── impersonate.ts             # Admin impersonation via httpOnly cookie
└── utils.ts                   # cn(), formatDisplayAddress(), formatPhoneNumber()
types/database.ts              # All TypeScript interfaces for DB tables
hooks/use-notifications.ts     # Push notification subscription hook
proxy.ts                       # Next.js middleware (named export `proxy`, not `middleware`)
public/sw.js                   # Service worker for push notifications
public/manifest.json           # PWA manifest
supabase/migrations/           # 17 SQL migration files (00001–00017)
scripts/                       # Seed data scripts (seed-test-data.ts, seed-uga-data.ts, etc.)
```

### Critical Architecture Decision: `proxy.ts` not `middleware.ts`

Next.js 16 uses a **named `proxy` export** from `proxy.ts` instead of the traditional `middleware.ts` with a default `middleware` export. This is the single most important thing to know. The file at the project root is `proxy.ts` and it exports `async function proxy(request)`.

### Module Boundaries

- **Server Components** (default): `app/page.tsx`, `app/(dashboard)/**/page.tsx`, `app/profile/page.tsx`, `components/navigation/bottom-nav-server.tsx`
- **Client Components** (`"use client"`): All components in `components/` except `bottom-nav-server.tsx`. All files in `hooks/`.
- **API Routes**: All under `app/api/`. Server-only, use `createClient()` or `createAdminClient()` from `lib/supabase/server.ts`.
- **Shared Types**: `types/database.ts` — imported everywhere.

### Data Flow

1. **Server Components** fetch data via Supabase server client → pass as props to client components
2. **Client Components** call API routes via `fetch()` for mutations
3. **Supabase Realtime** subscriptions in client components trigger `router.refresh()` for live updates
4. **Push Notifications** sent server-side via `web-push` library through API routes

---

## Database Schema

**7 tables** with Row Level Security (RLS) on all:

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `profiles` | User accounts (synced from Google OAuth) | `id`, `email`, `full_name`, `avatar_url`, `role` (`admin`/`organizer`/`member`), `phone_number` |
| `events` | Friday carpool events | `id`, `title`, `event_date`, `event_time`, `location`, `status` (`draft`/`open`/`closed`/`published`), `published_carpools` (jsonb), `carpools_sent_at`, `last_assistance` (jsonb) |
| `responses` | User carpool preferences per event | `id`, `event_id`, `user_id`, `role` (`driver`/`rider`/`attending`), `before_role`, `after_role`, `pickup_address/lat/lng`, `return_address/lat/lng`, `available_seats`, `departure_time`, `note` |
| `preferences` | Avoid/prefer relationships | `response_id`, `target_user_id`, `type` (`prefer`/`avoid`) |
| `carpools` | Generated carpool groups | `event_id`, `driver_id`, `leg` (`before`/`after`), `pickup_order_sent_at`, `pickup_order_sent_riders` (jsonb) |
| `carpool_riders` | Riders assigned to carpools | `carpool_id`, `rider_id`, `pickup_order` |
| `push_subscriptions` | Browser push notification subscriptions | `user_id`, `endpoint`, `keys_p256dh`, `keys_auth` |

**Two-leg model:** Each event has "before" (trip to event) and "after" (return trip) legs. Users can have different roles per leg (e.g., driver before, rider after).

**Published carpools snapshot:** When organizer sends carpools, the current state is snapshotted into `events.published_carpools` as JSONB. This is what users see — live carpool table changes don't affect the user view until re-published.

Migrations are in `supabase/migrations/00001_initial_schema.sql` through `00017_add_last_assistance.sql`.

---

## API Routes (16 total)

| Route | Methods | Auth | Purpose |
|-------|---------|------|---------|
| `/api/auth/google` | GET | None | Initiate Google OAuth flow |
| `/api/events` | GET, POST | Auth; POST=organizer | List/create events |
| `/api/events/[id]` | GET, PATCH, DELETE | Auth; PATCH/DELETE=organizer | Event CRUD; PATCH to `open` triggers push notifications |
| `/api/events/[id]/carpools` | GET, POST | Auth; POST=organizer | Fetch responses+carpools; manually assign riders |
| `/api/events/[id]/carpools/history` | GET | Auth | Ride history counts per driver-rider pair |
| `/api/events/[id]/assistance` | POST | Organizer | Run matching algorithm, return proposed assignments + metrics |
| `/api/events/[id]/assistance/apply` | POST | Organizer | Persist algorithm results to carpools table |
| `/api/events/carpool-order` | PATCH | Auth (driver only) | Reorder pickup sequence; sync to published snapshot |
| `/api/match/[eventId]` | POST | Organizer | Legacy matching endpoint (simpler, no optimization) |
| `/api/responses/[eventId]` | GET, POST, DELETE | Auth | Submit/update/delete carpool preference response |
| `/api/profile` | GET, PATCH | Auth | User profile CRUD |
| `/api/members` | GET | Admin | List all members |
| `/api/members/[id]/role` | PATCH | Admin | Promote/demote user roles |
| `/api/impersonate` | POST, DELETE | Admin | Start/stop admin impersonation |
| `/api/notifications/send` | POST | Organizer | Send push notifications to users |
| `/api/notifications/subscribe` | POST, DELETE | Auth | Register/remove push subscription |

**Auth pattern:** Every API route checks `supabase.auth.getUser()` → returns 401 if missing. Role checks use profile lookup. Admin impersonation is respected via `getEffectiveUser()` from `lib/impersonate.ts`.

**Error response shape:** `{ error: string }` with appropriate HTTP status.

---

## Key Patterns and Conventions

### Naming

- **Files/folders:** `kebab-case` (e.g., `event-form.tsx`, `use-notifications.ts`)
- **Components:** `PascalCase` (e.g., `EventForm`, `BottomNav`)
- **Functions/variables:** `camelCase`
- **Types/interfaces:** `PascalCase` (e.g., `Profile`, `CarpoolAssignment`)
- **DB columns:** `snake_case`
- **Constants:** `UPPER_SNAKE_CASE` (e.g., `DESTINATION_ID`, `MAX_RESTARTS`)

### shadcn/ui Configuration

- Style: `base-maia`
- Icon library: `hugeicons`
- Primitives: `@base-ui/react` (NOT Radix)
- **Dialog/Dropdown triggers use `render={<Button />}` prop, NOT `asChild`**
- `cn()` utility from `lib/utils.ts` for conditional Tailwind class merging

### State Management

- **No global state library.** All state is local React `useState`/`useRef` hooks.
- Server Components fetch data and pass as props to client components.
- Real-time updates use Supabase Realtime subscriptions that call `router.refresh()` to trigger server component re-fetching.
- Form state is managed locally within form components.

### Supabase Client Usage

- **Browser (client components):** `import { createClient } from "@/lib/supabase/client"` — uses `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`
- **Server (server components, API routes):** `import { createClient } from "@/lib/supabase/server"` — RLS-bound, uses cookies for auth
- **Admin (bypass RLS):** `import { createAdminClient } from "@/lib/supabase/server"` — uses `SUPABASE_SECRET_KEY`, only in API routes after auth verification
- **No generated Supabase types** — queries use `as { data: T }` casts

### Loading States

Global loading uses `FluidWaveLoader` in root layout:
```typescript
import { triggerFluidWave, dismissFluidWave } from "@/components/ui/fluid-wave-loader";
triggerFluidWave();  // Before fetch/navigation
dismissFluidWave();  // After completion (in finally block)
// Auto-dismisses on pathname change for router.push()
```

### Navigation

- **No top navbar or sidebar.** All navigation through a bottom nav chip (`BottomNav`).
- Profile chip at bottom center opens dropdown menu upward.
- Back button appears to the left when not on home page.
- `BottomNavServer` (server component) fetches auth → renders `BottomNav` (client component) or returns null.

### Custom Tailwind Variants

Defined in `app/globals.css`:
- `tall:` — `@media (min-height: 700px)`
- `xtall:` — `@media (min-height: 830px)`

Used for responsive typography on different screen heights.

### Animation Patterns

- **Framer Motion** (`motion` package): scale/opacity transitions on buttons, slide animations on views
- **Custom CSS keyframes**: `fluid-wave`, `slide-in-right`, `slide-in-left` in globals.css
- **Intersection Observer**: scroll-reveal animations in carpool views
- **Custom events**: `shake-profile-chip` event for phone number validation feedback

---

## Matching Algorithm

Located in `lib/matching/algorithm.ts` (726 lines). Two entry points:

### `matchCarpools()` — Basic Greedy
Used by legacy `/api/match/[eventId]` route.
1. Sort riders by distance to destination (farthest first)
2. For each rider, find best driver by: `score = preferenceBonus * 0.5 - normalizedDistance`
3. Hard constraints: avoid preferences never violated, seat capacity respected
4. Unassigned riders silently dropped

### `optimizedMatchCarpools()` — Multi-Start Local Search
Used by `/api/events/[id]/assistance` route.
1. Greedy seed → local search (moves + swaps, up to 50 iterations)
2. 100 random restarts, each with local search
3. Best result across all restarts returned
4. Cost function: `totalDistance + λ · Σ(riders_d − mean)²` (load-balance penalty, λ ≈ 20% of avg per-driver distance)
5. Returns `CarpoolAssignment[]`, `OptimizationMetrics`, and `IterationSnapshot[]` (for animation)
6. Optionally accepts real driving distances via Google Distance Matrix API

Key exported types: `MatchDriver`, `MatchRider`, `MatchPreference`, `CarpoolAssignment`, `OptimizationMetrics`, `IterationSnapshot`, `DistanceLookup`

Key exported functions: `matchCarpools`, `optimizedMatchCarpools`, `routeCost`, `routeOrder`, `buildHaversineDistanceLookup`

Key constants: `DESTINATION_ID = "__destination__"`

---

## Environment Variables

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=                          # Supabase project URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=      # Supabase anon/publishable key (NOT "PUBLISHABLE_KEY")
SUPABASE_SECRET_KEY=                               # Supabase service role key (server-only)

# Google Maps
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=                   # Maps JS API, Places, Distance Matrix, Geocoding, Routes

# Push Notifications (VAPID)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=                      # VAPID public key (client + server)
VAPID_PRIVATE_KEY=                                 # VAPID private key (server-only)
```

**Warning:** The Supabase publishable key env var is `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` — NOT `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

---

## Build & Run

```bash
# Install dependencies
npm install

# Development server
npm run dev          # next dev (http://localhost:3000)

# Production build
npm run build        # next build

# Start production server
npm start            # next start

# Lint
npm run lint         # eslint

# Seed test data (requires env vars)
npx tsx scripts/seed-test-data.ts
npx tsx scripts/seed-uga-data.ts

# Clean up test data
npx tsx scripts/cleanup-test-data.ts
```

**No test runner configured yet.** The project conventions mention vitest but it's not in `package.json`.

---

## User Roles & Authorization

Three roles with increasing privileges:

| Role | Can Do |
|------|--------|
| `member` | Submit/edit/delete own carpool responses, manage own profile, view own carpool assignments |
| `organizer` | Everything member can + create/edit/delete events, run matching algorithm, send notifications, view carpool audit, publish carpools |
| `admin` | Everything organizer can + manage all members' roles, impersonate any user ("View as"), access `/api/members` routes |

- Dashboard routes (`/dashboard/*`) are **auth-gated but not role-gated** — any authenticated user can access the pages
- The `BottomNav` component controls visibility of navigation links based on role
- API routes enforce role checks server-side

---

## Domain Vocabulary

| Term | Meaning |
|------|---------|
| **Leg** | One direction of a carpool trip. `before` = trip TO the event, `after` = return trip FROM the event |
| **Response** | A user's carpool preference submission for an event (role, location, seats, etc.) |
| **Avoid preference** | Hard constraint — never put these two people in the same car |
| **Prefer preference** | Soft constraint — try to group these people together |
| **Published carpools** | Frozen snapshot of carpool assignments stored in `events.published_carpools`. Users see this, not live data. |
| **Pickup order** | The sequence a driver picks up riders. Drivers can reorder via drag-and-drop. |
| **Assistance** | The AI/algorithm matching feature — runs `optimizedMatchCarpools()` and shows animated optimization |
| **Carpool audit** | The organizer view (`CarpoolAssignments` component) for reviewing/editing carpool assignments before publishing |
| **Impersonation** | Admin feature to "View as" another user via `impersonate_user_id` httpOnly cookie (4-hour expiry) |
| **Fluid wave** | Global loading animation triggered via custom events. Shows at bottom of screen during navigation/API calls. |
| **Effective user** | The user ID used for data operations — either the real user or the impersonated user |

---

## Constraints & Gotchas

### Next.js 16 Breaking Changes
- **`proxy.ts` replaces `middleware.ts`** — the file exports a named `proxy` function, not `middleware`. Check `node_modules/next/dist/docs/` for current API docs before writing middleware code.
- Read the relevant guide in `node_modules/next/dist/docs/` before using any Next.js API — conventions may differ from training data.

### Supabase
- **No auto-generated types** — all DB queries cast results manually: `as { data: MyType | null }`
- The publishable key env var is `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` (note `_DEFAULT_` suffix)
- `createAdminClient()` bypasses RLS — only use after verifying auth in API routes
- Realtime is only enabled on the `events` table (`ALTER PUBLICATION supabase_realtime ADD TABLE public.events`)
- Profile creation is handled by a database trigger on `auth.users` insert

### shadcn/ui + @base-ui/react
- Uses `@base-ui/react` primitives, NOT Radix UI
- Dialog and Dropdown triggers use `render={<Button />}` prop — **NOT `asChild`**
- shadcn style is `base-maia` (not `new-york` or `default`)

### Google Maps
- The API key (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`) needs these APIs enabled: Maps JavaScript API, Places API, Distance Matrix API, Geocoding API, Routes API
- `GOOGLE_MAPS_LIBRARIES` constant exports `["places", "routes"]`
- The carpool detail view uses the Routes API (`computeRoutes`) for distance/duration, with haversine as fallback
- Avatar images for map markers are cached in-memory to avoid 429 rate limits from Google avatar URLs

### Two-Leg Carpool Model
- Each response has `before_role` and `after_role` — users can be a driver to the event and a rider home (or vice versa)
- Matching algorithm runs independently per leg
- `published_carpools` JSON shape: `{ before: PublishedCarpoolEntry[], after: PublishedCarpoolEntry[] }`
- Carpool order sent state is tracked per leg via `carpools.pickup_order_sent_at` and `pickup_order_sent_riders`

### Published vs Live Carpools
- Users only see the `published_carpools` snapshot on `events`, NOT the live `carpools`/`carpool_riders` tables
- Organizers edit live carpools, then "send" to snapshot into `published_carpools` and notify users
- The dashboard detects unsent changes by comparing live state against the published snapshot

### PWA
- Service worker at `public/sw.js` handles push notification display and click-to-navigate
- PWA manifest at `public/manifest.json`
- iOS PWA install banner appears for Safari users not already in standalone mode
- No offline support — the service worker only handles push events

### Phone Number Requirement
- Users must have a phone number saved before they can submit event responses
- The `ActiveEventCard` triggers a shake animation on the profile chip if phone number is missing
- Phone numbers are validated as exactly 10 US digits

### Impersonation System
- Admin-only feature using `impersonate_user_id` httpOnly cookie with 4-hour expiry
- `getEffectiveUser()` in `lib/impersonate.ts` resolves the effective user ID
- Non-admin users with the cookie have it silently ignored
- Used for debugging — lets admin see the app from another user's perspective

### Custom Events
- `fluid-wave-loading` / `fluid-wave-dismiss` — trigger/dismiss global loading animation
- `shake-profile-chip` — shake the bottom nav profile chip (phone number validation feedback)

### Event Lifecycle
`draft` → `open` (triggers push notification to all members) → `closed` (form submissions stop) → `published` (carpools sent to users)

### No Test Suite
The project conventions mention vitest but no test dependencies are installed. The matching algorithm is the most critical piece needing tests.

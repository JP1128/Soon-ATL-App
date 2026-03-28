# Carpool App — Copilot Instructions

## Project Overview

This is a carpool coordination web app for a college student organization. Every Friday there's an event, and this app replaces the manual process of collecting carpool preferences via forms and manually organizing driver/rider assignments in spreadsheets.

## Tech Stack

- **Framework**: Next.js (App Router) with TypeScript
- **Styling**: Tailwind CSS + shadcn/ui components
- **Database & Auth**: Supabase (PostgreSQL, Google OAuth, Realtime)
- **Maps**: Google Maps JavaScript API + Places Autocomplete + Distance Matrix API
- **Notifications**: Web Push API (browser-native)
- **Hosting**: Vercel (free tier)

## Architecture

- Use Next.js API routes for all server-side logic (no separate backend)
- Use Supabase client with the **publishable key** (`sb_publishable_...`) on the client side
- Use Supabase **secret key** (`sb_secret_...`) only in server-side API routes — never expose it to the browser
- Supabase Realtime for live updates to the organizer dashboard
- All addresses are US-based

## Code Style & Conventions

### TypeScript
- Strict mode enabled — no `any` types unless absolutely necessary
- Use `interface` for object shapes, `type` for unions and intersections
- Prefer `const` over `let`, never use `var`
- Use early returns to reduce nesting
- All functions should have explicit return types

### React / Next.js
- Use functional components only — no class components
- Use the App Router (`/app` directory) — not the Pages Router
- Server Components by default — only add `'use client'` when the component needs interactivity, hooks, or browser APIs
- Colocate related files: keep component, types, and utils together in feature folders
- Use `async/await` in Server Components for data fetching
- Prefer named exports over default exports (except for page/layout files which require default exports)

### File & Folder Structure
```
app/                        # Next.js App Router pages & layouts
├── (dashboard)/            # Event management routes (auth-gated, no role gate)
│   └── dashboard/
│       ├── events/[id]/    # Event detail/management
│       ├── past-events/    # Past events archive
│       └── profile/        # Profile settings (dashboard copy)
├── auth/callback/          # Google OAuth callback
├── event/[id]/             # Public event form page
├── profile/                # Profile & settings page
├── api/                    # API routes
│   ├── auth/google/        # OAuth initiation
│   ├── events/             # Event CRUD
│   ├── responses/          # Form response handling
│   ├── match/              # Carpool matching algorithm
│   └── notifications/      # Push notification endpoints
├── layout.tsx              # Root layout — includes BottomNavServer
└── page.tsx                # Home / landing page
components/
├── ui/                     # shadcn/ui components
├── forms/                  # Form-related components
├── navigation/             # BottomNav (bottom-nav.tsx, bottom-nav-server.tsx)
├── maps/                   # Google Maps components
└── dashboard/              # Event management components
lib/
├── supabase/               # Supabase client setup (browser + server)
├── google-maps/            # Maps API utilities
├── matching/               # Carpool matching algorithm
└── utils.ts                # General utilities
types/                      # Shared TypeScript types
hooks/                      # Custom React hooks
```

### Naming Conventions
- Files & folders: `kebab-case` (e.g., `event-form.tsx`, `use-carpool-match.ts`)
- Components: `PascalCase` (e.g., `EventForm`, `DriverCard`)
- Functions & variables: `camelCase`
- Types & interfaces: `PascalCase` (e.g., `CarpoolResponse`, `DriverPreference`)
- Constants: `UPPER_SNAKE_CASE` for true constants (e.g., `MAX_RIDERS_PER_CAR`)
- Database columns: `snake_case` (matching Supabase/PostgreSQL convention)

### Styling
- Use Tailwind utility classes — no custom CSS files unless absolutely necessary
- Use shadcn/ui components as the base for all UI elements
- Mobile-first responsive design — most users will open the form link on their phone
- Use `cn()` utility from shadcn for conditional class merging

### Error Handling
- Wrap async operations in try/catch
- Return meaningful error messages from API routes
- Use Supabase error types for database error handling
- Show user-friendly error states in the UI — never expose raw error messages

### Supabase
- Always use Row Level Security (RLS) on all tables
- Use the Supabase SSR package (`@supabase/ssr`) for auth in Next.js
- Use `createBrowserClient` for client components, `createServerClient` for server components and API routes
- Reference the publishable key as `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in env vars
- Reference the secret key as `SUPABASE_SECRET_KEY` (no NEXT_PUBLIC_ prefix)

### Google Maps
- Restrict the API key to your domain in Google Cloud Console
- Store coordinates (lat/lng) alongside address strings in the database
- Use Places Autocomplete restricted to US addresses only
- Cache Distance Matrix API results to minimize API calls and costs

## Database Schema (Core Tables)

```sql
-- profiles (synced from Google OAuth)
profiles: id (uuid, PK, references auth.users), email, full_name, avatar_url, role ('organizer' | 'member'), created_at

-- events (each Friday event)
events: id (uuid, PK), title, event_date (date), location (text), status ('draft' | 'open' | 'closed' | 'published'), created_by (references profiles), created_at

-- responses (form submissions per event)
responses: id (uuid, PK), event_id (references events), user_id (references profiles), role ('driver' | 'rider' | 'attending'), pickup_address, pickup_lat, pickup_lng, dropoff_address, dropoff_lat, dropoff_lng, needs_return_ride (boolean), return_address, return_lat, return_lng, available_seats (integer, drivers only), submitted_at, updated_at

-- preferences (avoid/prefer relationships)
preferences: id (uuid, PK), response_id (references responses), target_user_id (references profiles), type ('prefer' | 'avoid')

-- carpools (generated configurations)
carpools: id (uuid, PK), event_id (references events), driver_id (references profiles), route_summary (jsonb), total_distance_meters (integer), status ('auto' | 'manual'), created_at

-- carpool_riders (riders assigned to carpools)
carpool_riders: id (uuid, PK), carpool_id (references carpools), rider_id (references profiles), pickup_order (integer)
```

## Navigation & Design System

- **No separate organizer vs member views** — all users share the same routes and layouts. Organizers simply see additional navigation items in the bottom nav menu.
- **Bottom nav chip**: The primary navigation element is a profile chip (`BottomNav`) fixed at the bottom center of the screen. Tapping it opens a dropdown menu (upward) with navigation links.
  - All users see: Home, Profile & Settings, Sign Out
  - Organizers additionally see: Manage Events, Past Events
- **Back button**: When the user is not on the home page (`/`), a back button appears to the left of the profile chip (uses `router.back()`).
- **BottomNavServer** (server component) fetches auth/profile data and renders `BottomNav`. It returns `null` for unauthenticated users. It is rendered in the root `layout.tsx`.
- **No top navbar or sidebar** — all navigation flows through the bottom nav chip.
- **Dashboard routes** (`/dashboard/*`) are auth-gated but **not role-gated** — any authenticated user can access them. The `BottomNav` controls visibility of the links to these routes based on role.
- Pages use simple `<h1>` headings instead of a `PageHeader` component.

## Key Business Rules

- Each event has one form that collects responses for both the trip TO the event and the return trip
- Drivers specify available seats — the matching algorithm must respect capacity
- "Avoid" preferences are hard constraints — never assign someone to a car with a person they want to avoid
- "Prefer" preferences are soft constraints — try to honor them but they can be overridden
- The organizer can manually override any auto-generated assignment
- Last-minute changes after publishing should trigger notifications to the organizer
- The matching algorithm should minimize total driving distance across all carpools

## Testing

- Write unit tests for the matching algorithm (this is the most critical logic)
- Use `vitest` as the test runner
- Test edge cases: more riders than seats, conflicting avoid preferences, no drivers available

## Loading States

Whenever a route navigation or async operation (API call, resource loading) occurs, show the fluid wave loading animation:

- Import `triggerFluidWave` and `dismissFluidWave` from `@/components/ui/fluid-wave-loader`
- Call `triggerFluidWave()` before starting the operation (before `fetch`, `router.push`, etc.)
- Call `dismissFluidWave()` when the operation completes (in a `finally` block for API calls, or after navigation resolves)
- For route navigations via `router.push()` / `router.replace()`, call `triggerFluidWave()` immediately before — the `FluidWaveLoader` component auto-dismisses on pathname change
- The `FluidWaveLoader` component is rendered once in the root `layout.tsx` and uses custom events (`fluid-wave-loading` / `fluid-wave-dismiss`) to coordinate globally
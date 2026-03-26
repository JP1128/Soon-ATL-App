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
src/
├── app/                    # Next.js App Router pages & layouts
│   ├── (auth)/             # Auth-related routes (login, callback)
│   ├── (dashboard)/        # Organizer dashboard routes
│   ├── event/[id]/         # Dynamic event form page
│   ├── api/                # API routes
│   │   ├── events/         # Event CRUD
│   │   ├── responses/      # Form response handling
│   │   ├── match/          # Carpool matching algorithm
│   │   └── notifications/  # Push notification endpoints
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── ui/                 # shadcn/ui components
│   ├── forms/              # Form-related components
│   ├── maps/               # Google Maps components
│   └── dashboard/          # Organizer dashboard components
├── lib/
│   ├── supabase/           # Supabase client setup (browser + server)
│   ├── google-maps/        # Maps API utilities
│   ├── matching/           # Carpool matching algorithm
│   └── utils.ts            # General utilities
├── types/                  # Shared TypeScript types
└── hooks/                  # Custom React hooks
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
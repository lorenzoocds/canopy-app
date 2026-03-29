# Canopy

**Crowdsourced civic logistics platform**

Canopy is a comprehensive platform that connects citizens, gig workers, and utility companies to efficiently manage and resolve infrastructure issues. Citizens report problems like downed branches, potholes, and power line hazards through a mobile app. Gig workers verify reports and fulfill maintenance tasks through a DoorDash-style job system. Utility companies coordinate everything via a web-based admin dashboard.

## Tech Stack

- **Mobile**: React Native (Expo 54) with TypeScript
- **Web Dashboard**: React 19 + Vite with TypeScript
- **Backend**: Supabase (Postgres, Auth, Storage, Realtime)

## Project Structure

```
canopy/
├── mobile/          # Expo-based React Native app for reporters and workers
├── dashboard/       # Vite + React web app for utility company admins
└── supabase/        # Database migrations and configuration
```

## Features by Role

### Reporter
- Submit infrastructure issues with camera photos and GPS location
- View real-time progress of submitted reports
- Track status updates as workers verify and complete work

### Worker
- Browse available jobs in job feed (DoorDash-style)
- Receive location-based job offers with earnings information
- Complete verification workflows and errand tasks
- Geofenced check-in for arrival verification
- Track earnings and completed work history

### Admin
- Manage and view all submitted reports
- Create and post errand work orders
- Assign work to available gig workers
- Manage user accounts and permissions
- Monitor job completion and system activity

## Getting Started

### Prerequisites

- Node.js 18 or higher
- Expo CLI (`npm install -g expo-cli`)
- Supabase account and project

### Installation

1. Clone the repository:
```bash
git clone <repo-url>
cd canopy
```

2. Install dependencies for mobile:
```bash
cd mobile
npm install
cd ..
```

3. Install dependencies for dashboard:
```bash
cd dashboard
npm install
cd ..
```

4. Set up environment variables:
   - Copy `mobile/.env.example` to `mobile/.env.local` and fill in your Supabase credentials
   - Copy `dashboard/.env.example` to `dashboard/.env.local` and fill in your Supabase credentials
   - See [Environment Variables](#environment-variables) section below

5. Run Supabase migrations:
```bash
cd supabase
# Follow your Supabase setup guide to run migrations
cd ..
```

### Running the Apps

**Start the mobile app:**
```bash
cd mobile
npx expo start
# Press 'i' for iOS simulator or 'a' for Android emulator
```

**Start the web dashboard:**
```bash
cd dashboard
npm run dev
# Runs on http://localhost:5173
```

## Environment Variables

### Mobile (`mobile/.env.example`)
```
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=your-google-maps-key
```

### Dashboard (`dashboard/.env.example`)
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

**Note:** Create `.env.local` files locally with actual credentials. Do not commit `.env.local` to version control.

## License

MIT

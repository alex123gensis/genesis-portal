# Genesis Customer Portal

A separate web app where customers (Lubrizol first) track their shipments and see the sailing schedule, and agents
(Seaspeed) enter vessel options. Genesis staff manage everything from the main Tank App (CRM > Customer Portal).

## How it is built (for the developer)

- Vite + React single page app (`src/`) and Vercel serverless functions (`api/`).
- Sign-in uses a SEPARATE Supabase project (auth only, no tables). The browser never gets a key to the main Genesis
  database.
- Every data read goes through `api/*.js`: the function verifies the portal-project session token, looks the e-mail up in
  the main project (`portal.whoami`), and calls the main project's `portal.*` RPCs with the service role, always passing
  the caller's own account id. The RPCs (Inventory migration 099) only return jobs matched to that account.
- Roles: `CUSTOMER` (shipments + schedule, read-only) and `AGENT` (own bookings + schedule, can add / edit own sailings).

## Environment variables (Vercel > Project > Settings > Environment Variables)

    VITE_PORTAL_SUPABASE_URL          https://<portal-ref>.supabase.co        (portal project, goes into the build)
    VITE_PORTAL_SUPABASE_ANON_KEY     <portal project anon key>
    PORTAL_SUPABASE_URL               https://<portal-ref>.supabase.co        (server side)
    PORTAL_SUPABASE_ANON_KEY          <portal project anon key>
    MAIN_SUPABASE_URL                 https://tciwjnbnskphpzyoczfb.supabase.co
    MAIN_SUPABASE_SERVICE_ROLE_KEY    <MAIN project service_role key - server only>

## Local run

    npm install
    cp .env.example .env.local   # fill the VITE_ values
    npm run dev                  # SPA only; api/ needs `vercel dev`

## Pages

- Sign in (e-mail + password issued by Genesis; first sign-in forces a password change)
- My shipments / Bookings: tiles by stage, searchable list, CSV download, booking detail with per-tank dates
- Sailing schedule: published vessel options with ETD / ETA, gate-in open and cut-off, document cut-off, DG, space;
  agents get an editor for their own entries
- Account: details and change password

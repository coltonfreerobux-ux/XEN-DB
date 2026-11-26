# District Desk

A responsive district administration and staff portal backed by a shared PostgreSQL database. Users can sign in from different devices and see the same applications, accounts, roles, tasks, and service requests.

## Deploy on Render

This app is a Node.js web service, not a static site. It needs a PostgreSQL database because a Render web service's local filesystem is not shared between devices and can be reset on deploy/restart.

### Connect a database to your existing Render web service

1. In Render, create a PostgreSQL database (or use an existing one).
2. Open the database's **Info** page and copy its **Internal Database URL**.
3. Open your web service **Environment** settings. Add `DATABASE_URL` with that internal URL, `SESSION_SECRET` with a unique random value of at least 32 characters, and `NODE_ENV` set to `production`.
4. Confirm the service uses **Build Command** `npm install` and **Start Command** `npm start`.
5. Save changes and redeploy. The server creates its table automatically on startup.

Alternatively, use `render.yaml` to create a Render web service and its managed PostgreSQL database together from a Blueprint. If your current service was created separately, make sure it receives the `DATABASE_URL` environment variable from its connected database before deploying this version.

### First login

Visit your Render service URL after deployment and create the owner account. Do this promptly: the first successful setup claims the single owner account. Then apply as a district admin and approve the application from the owner console.

## Security and persistence

Passwords are hashed on the server with PBKDF2; sessions use a signed, HTTP-only cookie. Access to state mutations is checked on the server. PostgreSQL is the source of truth, so data is shared across devices and persists across service restarts and deployments. Keep `DATABASE_URL` and `SESSION_SECRET` private, and use HTTPS (Render provides it). This prototype currently has a single shared workspace for one district/organization; it is not a multi-tenant SaaS app.

For local development, create a PostgreSQL database, set `DATABASE_URL` and `SESSION_SECRET`, run `npm install`, and run `npm start`.

# StudySprint

Minimalist study goal tracker — create goals, log timed sessions, and visualize progress.

**Live app:** https://studysprint-frontend.onrender.com

---

## Prerequisites

- Node.js 18+
- PostgreSQL (local instance)

---

## Local setup

### 1. Clone and install dependencies

```bash
cd StudySprint
npm run setup        # installs frontend + backend deps
```

### 2. Create the backend environment file

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` and fill in your local values:

```
DATABASE_URL=postgresql://postgres:password@localhost:5432/study_sprint
JWT_SECRET=any-random-string
PORT=4000
CLIENT_ORIGIN=http://localhost:5173
```

### 3. Create the database

```bash
createdb study_sprint
```

### 4. Run migrations and seed

```bash
cd backend
npm run migrate      # creates tables
npm run seed         # creates demo@example.com / demo123 with starter data
cd ..
```

### 5. Start the dev server

```bash
npm run dev          # starts frontend (port 5173) and backend (port 4000) together
```

---

## Demo account

| Email | Password |
|---|---|
| demo@example.com | demo123 |

---

## Project structure

```
StudySprint/
├── frontend/          # React 18 + TypeScript + Vite + TailwindCSS v4
├── backend/           # Express.js + PostgreSQL API
│   ├── routes/        # auth, goals, sessions, subjects
│   ├── middleware/    # JWT auth
│   ├── scripts/       # migrate.js, seed.js
│   └── sql/           # schema.sql
├── index.html
├── vite.config.ts
└── package.json
```

---

## Environment variables

### Backend (`backend/.env`)

| Key | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret for signing JWTs |
| `PORT` | Port for the API server (default: 4000) |
| `CLIENT_ORIGIN` | Frontend URL for CORS (e.g. `http://localhost:5173`) |

### Frontend (`.env` in `StudySprint/`)

| Key | Description |
|---|---|
| `VITE_API_URL` | Backend URL (defaults to `http://localhost:4000` if not set) |

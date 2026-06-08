# Quickstart: Authentication v1

**Feature**: Authentication v1
**Date**: 2026-06-08
**Branch**: `002-authentication-v1`

This guide enables a developer to run the Authentication v1 feature locally for development and testing.

---

## Prerequisites

- Node.js 20+ and npm/pnpm
- PostgreSQL 15+ running locally or via Docker (needed because the backend app module initializes Prisma, though auth v1 does not use DB tables)
- Git

## 1. Clone and Switch Branch

```bash
git clone <repository-url>
cd priora-scan
git checkout 002-authentication-v1
```

## 2. Start PostgreSQL

```bash
# Using Docker
docker run -d \
  --name priora-db \
  -e POSTGRES_USER=priora \
  -e POSTGRES_PASSWORD=priora_dev \
  -e POSTGRES_DB=priora_dev \
  -p 5432:5432 \
  postgres:15
```

## 3. Backend Setup

```bash
cd backend
npm install

# Copy environment file
cp .env.example .env
```

Edit `.env`:

```env
DATABASE_URL=postgresql://priora:priora_dev@localhost:5432/priora_dev
JWT_SECRET=your-local-jwt-secret-min-32-chars
JWT_EXPIRES_IN=15m
PORT=3001

# Security
CORS_ORIGIN=http://localhost:3000
COOKIE_SECURE=false
COOKIE_SAMESITE=strict
CSRF_SECRET=another-32-char-secret-for-csrf
```

Apply existing Prisma migrations (from 001-vehicle-management):

```bash
npx prisma migrate deploy
npx prisma generate
```

Start the development server:

```bash
npm run start:dev
```

The API will be available at `http://localhost:3001`.

## 4. Frontend Setup

```bash
cd frontend
npm install

# Copy environment file
cp .env.example .env.local
```

Edit `.env.local`:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001/api/v1
```

Start the Next.js development server:

```bash
npm run dev
```

The frontend will be available at `http://localhost:3000`.

## 5. Verify Authentication Endpoints

### Login

```bash
curl -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"tech@workshop.com","password":"password123"}' \
  -c cookies.txt
```

This saves `access_token`, `refresh_token`, and `csrf_token` cookies.

### Get Current User

```bash
curl http://localhost:3001/api/v1/auth/me \
  -b cookies.txt
```

### Get CSRF Token

```bash
curl http://localhost:3001/api/v1/auth/csrf \
  -b cookies.txt
```

### Refresh Token

```bash
curl -X POST http://localhost:3001/api/v1/auth/refresh \
  -b cookies.txt
```

### Logout

```bash
curl -X POST http://localhost:3001/api/v1/auth/logout \
  -b cookies.txt
```

### Access Protected Endpoint (should fail when logged out)

```bash
curl http://localhost:3001/api/v1/vehicles \
  -b cookies.txt
```

Expected: `401 UNAUTHORIZED`

## 6. Verify Frontend Login Page

1. Open `http://localhost:3000/login`
2. Enter `tech@workshop.com` / `password123`
3. Submit — you should be redirected to `/vehicles`
4. Open browser DevTools → Application → Cookies — verify `access_token`, `refresh_token`, `csrf_token` are present
5. Refresh the page — you should remain on `/vehicles` (session persistence)
6. Click logout — you should be redirected back to `/login`
7. Navigate directly to `http://localhost:3000/vehicles` while logged out — you should be redirected to `/login`

## 7. Verify Role-Based Behavior

| Email | Role | Can Create Vehicle? | Can Update Vehicle? |
|-------|------|--------------------|--------------------|
| `tech@workshop.com` | Technician | ✅ Yes | ❌ No |
| `advisor@workshop.com` | Service Advisor | ❌ No | ❌ No |
| `manager@workshop.com` | Workshop Manager | ✅ Yes | ✅ Yes |

Test by logging in with each user and attempting to POST or PATCH `/api/v1/vehicles`.

## 8. Running Tests

### Backend Tests

```bash
cd backend

# Unit tests
npm run test

# Integration tests
npm run test:integration

# Contract tests
npm run test:contract

# Security tests
npm run test:security
```

### Frontend Tests

```bash
cd frontend

# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Security tests
npm run test:security
```

## 9. Development Workflow

1. **Backend changes**: Edit files in `backend/src/auth/`. The NestJS dev server auto-reloads.
2. **Frontend changes**: Edit files in `frontend/src/`. Next.js dev server auto-reloads.
3. **API contracts**: Update `specs/002-authentication-v1/contracts/` if endpoint shapes change.
4. **Security changes**: Cookie, CORS, and CSRF settings are centralized in `backend/src/config/security.config.ts`.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Database connection refused | Verify PostgreSQL is running and `DATABASE_URL` is correct |
| JWT validation fails | Ensure `JWT_SECRET` is at least 32 characters |
| CORS errors | Verify `NEXT_PUBLIC_API_BASE_URL` points to the backend port and `CORS_ORIGIN` includes `http://localhost:3000` |
| CSRF 403 errors | Ensure `X-CSRF-Token` header is sent with mutating requests and matches the `csrf_token` cookie |
| Rate limited on login | Wait 60 seconds; the login endpoint allows 5 attempts per minute per IP |
| Session not persisting on refresh | Verify `refresh_token` cookie is set and `/auth/refresh` endpoint is reachable |
| Redirect loop on login page | Check that `/me` endpoint returns 200 when authenticated and middleware doesn't redirect `/login` for authed users |

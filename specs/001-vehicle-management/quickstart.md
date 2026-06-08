# Quickstart: Vehicle Management

**Feature**: Vehicle Management
**Date**: 2026-06-08
**Branch**: `001-vehicle-management`

This guide enables a developer to run the Vehicle Management feature locally for development and testing.

---

## Prerequisites

- Node.js 20+ and npm/pnpm
- PostgreSQL 15+ running locally or via Docker
- Git

## 1. Clone and Switch Branch

```bash
git clone <repository-url>
cd priora-scan
git checkout 001-vehicle-management
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

Generate Prisma Client and run migrations:

```bash
npx prisma migrate dev --name init_vehicle_management
npx prisma generate
```

Seed minimal data (optional):

```bash
npm run seed
```

Start the development server:

```bash
npm run start:dev
```

The API will be available at `http://localhost:3001/api/v1`.

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

## 5. Authenticate and Obtain CSRF Token

The API uses JWT in HTTP-only cookies with CSRF protection. First, authenticate to receive cookies:

```bash
curl -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"tech@workshop.com","password":"password"}' \
  -c cookies.txt
```

This saves `access_token`, `refresh_token`, and `csrf_token` cookies to `cookies.txt`.

Extract the CSRF token value:

```bash
CSRF_TOKEN=$(grep csrf_token cookies.txt | awk '{print $7}')
```

## 6. Verify the Feature

### Create a Vehicle

```bash
curl -X POST http://localhost:3001/api/v1/vehicles \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF_TOKEN" \
  -b cookies.txt \
  -d '{
    "make": "Toyota",
    "model": "Corolla",
    "year": 2022,
    "vin": "JTDBU4EE3B9123456",
    "plateNumber": "ABC-1234"
  }'
```

### List Vehicles

```bash
curl "http://localhost:3001/api/v1/vehicles?page=1&limit=25" \
  -b cookies.txt
```

### Get Vehicle Details

```bash
curl "http://localhost:3001/api/v1/vehicles/<vehicle-id>" \
  -b cookies.txt
```

### Update Vehicle (PATCH)

```bash
curl -X PATCH "http://localhost:3001/api/v1/vehicles/<vehicle-id>" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF_TOKEN" \
  -b cookies.txt \
  -d '{
    "model": "Camry",
    "year": 2023
  }'
```

## 7. Running Tests

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

## 8. Development Workflow

1. **Backend changes**: Edit files in `backend/src/`. The NestJS dev server auto-reloads.
2. **Frontend changes**: Edit files in `frontend/src/`. Next.js dev server auto-reloads.
3. **Database changes**: Update `backend/prisma/schema.prisma`, then run `npx prisma migrate dev --name <description>` followed by `npx prisma generate`.
4. **API contracts**: Update `specs/001-vehicle-management/contracts/` if endpoint shapes change.
5. **Security changes**: Cookie, CORS, and CSRF settings are centralized in `backend/src/config/security.config.ts`.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Database connection refused | Verify PostgreSQL is running and `DATABASE_URL` is correct |
| JWT validation fails | Ensure `JWT_SECRET` is at least 32 characters and matches the token issuer |
| CORS errors | Verify `NEXT_PUBLIC_API_BASE_URL` points to the backend port (3001) and `CORS_ORIGIN` includes `http://localhost:3000` |
| CSRF 403 errors | Ensure `X-CSRF-Token` header is sent with mutating requests and matches the `csrf_token` cookie |
| Cookie not sent cross-origin | Verify `withCredentials: true` in Axios config and `Access-Control-Allow-Credentials: true` in backend CORS |
| Migration fails | Check that the database exists and the user has CREATE TABLE privileges |
| Tenant isolation test fails | Ensure JWT `org` claim matches the seeded organization |

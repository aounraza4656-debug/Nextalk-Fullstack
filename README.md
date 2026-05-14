# NexVocal

Premium private chat platform with a luxury dark interface and production-ready architecture.

## Stack
- Frontend: React + Vite + Tailwind CSS + Framer Motion
- Backend: Node.js + Express + MongoDB + Socket.IO
- Auth: Gmail-only email/password + real OTP verification via SMTP (Gmail supported)
- Persistence: MongoDB (users, OTP sessions, conversations, messages)

## Project Structure
- `client` React app (Splash, Auth, OTP Verify, Premium Chat Dashboard)
- `server` Express API + Socket.IO realtime server

## Setup
1. Copy environment files:
   - `server/.env.example` -> `server/.env`
   - `client/.env.example` -> `client/.env`
2. Fill SMTP and JWT values in `server/.env`:
   - Use Gmail app password (`SMTP_USER` + `SMTP_PASS`) for OTP email delivery.
3. Install dependencies:
   - `npm run install:all`
4. Run backend:
   - `npm run dev:server`
5. Run frontend:
   - `npm run dev:client`

## Auth Flow (Real)
1. Signup/Login with Gmail only.
2. OTP code is emailed (6 digits).
3. User verifies OTP.
4. App creates authenticated session with access + refresh token cookies.
5. Protected routes require valid session.

## Implemented Features
- Luxury splash screen with glowing brand identity.
- Premium login/signup with Gmail validation, show/hide password, remember me.
- OTP verification screen:
  - 6 input boxes with auto-focus UX
  - single resend option with countdown timer
  - back/change-email support
- Main chat dashboard:
  - Left: profile, nav, user search, logout
  - Center: chat list, online status, last message, unread badge
  - Right: active private chat
- 1:1 private chat features:
  - send/receive text
  - image and file/document uploads
  - reply, forward, copy, delete own message
  - seen/delivered state
  - realtime presence + new messages via Socket.IO
  - no edit-message feature

## API Highlights
- `POST /api/auth/signup-init`
- `POST /api/auth/login-init`
- `POST /api/auth/verify-otp`
- `POST /api/auth/resend-otp`
- `GET /api/auth/me`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/users/search`
- `POST /api/conversations/direct`
- `GET /api/conversations`
- `GET /api/conversations/:id/messages`
- `PATCH /api/conversations/:id/seen`
- `POST /api/messages`
- `DELETE /api/messages/:id`

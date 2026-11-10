# PayPilot AI

**Intelligent commerce. Human-controlled payments.**

PayPilot AI is a fintech SaaS prototype for AI-assisted shopping with explicit user-controlled purchase approvals. It separates research and purchase preparation from payment execution.

## Product principles

- Help users compare purchase options and understand costs.
- Enforce user-defined budgets and spending boundaries before a request enters the approval queue.
- Require an explicit human decision for every purchase request.
- Never allow the assistant to capture or transfer money.
- Keep demo data clearly separated from real financial activity.

## What's in this repository

### Frontend
- React + TypeScript + Vite dashboard.
- Overview, AI Shopping catalogue, Approvals, Activity, Spending Rules, Integrations and Settings screens.
- Responsive layout and light/dark themes.
- Search/filter controls, approval review modal, product comparison and rule creation.
- Workspace preferences and demo actions persist in browser local storage.

### API foundation
- Express API with MongoDB/Mongoose models.
- Account registration and login using bcrypt password hashing and signed JWTs.
- Authenticated spending-rule, approval and transaction endpoints.
- Approval requests are checked against enabled spending rules and the user's monthly budget.
- An approval creates an `approved_pending_payment` record only. **It does not create a PayPal order, authorize a card, or capture a payment.**
- Helmet, CORS allow-listing, request-size limits and authentication rate limiting.

## Run locally

Requirements: Node.js 20+ and MongoDB (Atlas or a local replica-set deployment).

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create your environment file:

   ```bash
   cp .env.example .env
   ```

3. Set `MONGODB_URI` and a long random `JWT_SECRET` in `.env`.

4. Start the API:

   ```bash
   npm run server:dev
   ```

5. In another terminal, start the frontend:

   ```bash
   npm run dev
   ```

The frontend runs on Vite's local URL (normally `http://localhost:5173`) and the API listens on `http://localhost:4000`.

## API routes

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/health` | API health and integration safety status |
| POST | `/api/auth/register` | Create an account |
| POST | `/api/auth/login` | Sign in |
| GET | `/api/auth/me` | Get the signed-in profile |
| GET / POST | `/api/rules` | List or create spending rules |
| PATCH / DELETE | `/api/rules/:id` | Update or remove an owned rule |
| GET / POST | `/api/approvals` | List requests or submit a purchase request |
| PATCH | `/api/approvals/:id` | Approve or decline a pending request |
| GET | `/api/transactions` | List the signed-in user's activity |

Protected routes require `Authorization: Bearer <token>`.

## Important integration status

This is an actively developed prototype, not a live banking or payment product. The dashboard currently runs in local demo mode; the API foundation is separate and is not yet wired into every dashboard screen. The catalogue is sample data, not live merchant pricing. Gemini and PayPal environment variables are placeholders only. No real payment is possible in the current implementation.

Before enabling real integrations, the frontend must be connected to authenticated API endpoints, live product data must come from trusted merchant/provider sources, and PayPal sandbox checkout must be implemented and tested with explicit user confirmation before any capture endpoint can be called. Never commit secrets or production credentials.

## Build

```bash
npm run build
npm run check:server
``

GitHub Actions runs the frontend build on pushes and pull requests to `main`.

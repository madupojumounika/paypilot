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
- Public marketing website with product overview, features, and clear sign-in / get-started paths.
- Guest AI shopping page that can be used without creating an account.
- React + TypeScript + Vite account dashboard, shown after sign-in or registration.
- Overview, AI Shopping catalogue, Approvals, Activity, Spending Rules, Integrations and Settings screens.
- Responsive layout and light/dark themes.
- Search/filter controls, approval review modal, product comparison and rule creation.
- Email/password account registration and sign-in, plus Google Identity Services sign-in when OAuth is configured.
- Guest AI shopping research using OpenRouter free models plus Tavily search; sign-in is not required for research.
- Workspace preferences and demo actions persist in browser local storage.

### API foundation
- Express API with MongoDB/Mongoose models.
- Account registration and email/password login using bcrypt password hashing and signed JWTs.
- Google ID-token verification against the configured Google OAuth client ID; Google-verified email addresses are stored as passwordless accounts.
- Authenticated spending-rule, approval, transaction and append-only audit-trail endpoints.
- Purchase requests retain the original goal, recommendation, rejected alternatives, seller URL, budget snapshot and policy-check evidence; approval/decline decisions are recorded as append-only audit events and shown in Activity.
- Approval requests are checked against enabled spending rules and the user's monthly budget.
- OpenRouter-powered AI shopping research with Tavily web search. Both keys stay on the server; the AI receives search results and returns source links.
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

The frontend runs on Vite's local URL (normally `http://localhost:5173`) and the API listens on `http://localhost:4000`. `VITE_API_URL` controls the frontend's API target.


## Google sign-in setup

Google sign-in is implemented with Google Identity Services and verified on the API. To enable it:

1. In Google Cloud Console, create/select a project and configure the OAuth consent screen.
2. Create an OAuth 2.0 Client ID with application type **Web application**.
3. Add your local and production frontend origins under **Authorized JavaScript origins** (for example, `http://localhost:5173` and your deployed website origin).
4. Set the same client ID in both places:
   - Frontend environment: `VITE_GOOGLE_CLIENT_ID`
   - Backend environment: `GOOGLE_CLIENT_ID`
5. Restart/redeploy the frontend and API.

The Google button is shown only when `VITE_GOOGLE_CLIENT_ID` is configured. The API verifies the Google ID token and checks the verified email claim and audience before creating a session. Do not put client secrets in frontend variables; this flow uses a public web client ID only.

## API routes

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/health` | API health and integration safety status |
| POST | `/api/auth/register` | Create an account |
| POST | `/api/auth/login` | Email/password sign in |
| POST | `/api/auth/google` | Verify Google identity token and sign in |
| GET / PATCH | `/api/auth/me` | Get or update the signed-in profile and monthly budget |
| GET / POST | `/api/rules` | List or create spending rules |
| PATCH / DELETE | `/api/rules/:id` | Update or remove an owned rule |
| GET / POST | `/api/approvals` | List requests or submit a purchase request |
| PATCH | `/api/approvals/:id` | Approve or decline a pending request |
| GET | `/api/transactions` | List the signed-in user's activity |
| GET | `/api/audit` | Read the signed-in user's append-only purchase and conversion decision trail |\n| POST | `/api/fx/quotes` | Create a server-verified INR to USD ECB reference-rate estimate for an approved purchase |\n| POST | `/api/fx/quotes/:id/accept` | Record explicit acceptance of a still-valid conversion estimate |\n| POST | `/api/paypal/orders` | Create an idempotent PayPal Sandbox order from an accepted INR-to-USD estimate |\n| POST | `/api/paypal/capture` | Capture only after buyer approval and verify the returned USD amount server-side |\n| GET | `/api/paypal/receipt/:transactionId` | Retrieve a receipt only for a verified completed capture |
| POST | `/api/assistant/plan` | Run guest-accessible AI shopping research (OpenRouter + Tavily keys required) |

Protected account routes require `Authorization: Bearer <token>`. The AI shopping research route is public and rate-limited, so guests can try it without an account.

## Purchase workflow and PayPal Sandbox status

The signed-in Overview now presents the intended agentic-commerce flow: describe a goal, compare sourced products, enforce backend spending rules, obtain explicit human approval, then proceed to payment verification. The product research, INR budget guardrails, human approval, conversion-estimate review and PayPal Sandbox payment flow are implemented across the frontend and API. The INR-to-USD conversion estimate is fetched server-side from ECB reference rates via Frankfurter, stored with its source date and five-minute confirmation window, and presented after purchase approval. Users must explicitly accept the estimate; both quote creation and acceptance are recorded in the audit trail. The estimate is not a locked PayPal rate. PayPal Sandbox order creation, capture verification, receipt generation and payment outcome audit events are implemented in the API and wired to the browser SDK. They require server-only Sandbox credentials and a configured frontend PayPal Client ID before checkout can be used. Do not represent an approved request as a completed payment.

PayPal Checkout Orders v2 must be called from the backend; the browser only renders the PayPal SDK button and receives the payer approval callback. PayPal's current supported payment-currency list does not include INR. Because PayPilot's product budgets and seller prices are in INR, checkout must not silently submit an INR amount or relabel it as USD. A future sandbox flow must obtain a disclosed conversion quote, show the exact USD checkout amount and rate to the user, enforce the original INR budget on the server, and store both amounts and the quote with the receipt. Sandbox checkout also simulates a payment to the configured PayPal sandbox merchant account; it does not place an order with an external retailer.

## Important integration status

This is an actively developed prototype, not a live banking or payment product. The dashboard currently runs in local demo mode; the API foundation is separate and is not yet wired into every dashboard screen. The catalogue is sample data, not live merchant pricing. Free AI research can be enabled by setting `OPENROUTER_API_KEY`, `OPENROUTER_MODEL=openrouter/free`, and `TAVILY_API_KEY` on the server. OpenRouter free models and Tavily free credits are rate/usage limited; check their current terms. Guest and signed-in users can call the public research endpoint. PayPal environment variables are placeholders only. Set `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` only on the API server, and set the same public client ID as `VITE_PAYPAL_CLIENT_ID` on the frontend. The API is hard-pinned to PayPal Sandbox and cannot call the live PayPal host. A Sandbox capture pays the configured PayPilot merchant Sandbox account; it does not place an order with the external retailer.

Before enabling real integrations, the frontend must be connected to authenticated API endpoints, live product data must come from trusted merchant/provider sources, and PayPal sandbox checkout must be implemented and tested with explicit user confirmation before any capture endpoint can be called. Never commit secrets or production credentials.

## Build

```bash
npm run build
npm run check:server
``

GitHub Actions runs the frontend build on pushes and pull requests to `main`.

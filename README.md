# PayPilot AI

<p align="center">
  <strong>Smarter shopping. Transparent decisions. Human-controlled payments.</strong>
</p>

<p align="center">
  An AI-assisted purchasing command center that helps people research products, compare verified offers, stay within a budget, and explicitly approve a payment before checkout.
</p>

---

## Overview

PayPilot AI brings product discovery, purchase planning, spending rules, approval, and payment verification into one workflow.

Instead of allowing an AI agent to purchase autonomously, PayPilot keeps the user in control at every important step. AI supports research and decision-making; the user reviews the purchase and authorizes the payment.

**Core principle: AI can recommend. Only the user can approve.**

## Key features

- **AI-assisted product research** — Explore products using a natural-language shopping goal, supported by OpenRouter and Tavily search.
- **Verified seller offers** — Match product recommendations to seller listings and show INR prices only when the seller page provides a parseable price and currency.
- **Product comparison** — Review available offers and compare them against the requested product and budget.
- **Spending rules** — Configure purchase boundaries and monthly budget limits.
- **Human-in-the-loop approvals** — Review a purchase request and explicitly approve or decline it.
- **Transparent currency estimate** — Review an INR-to-USD reference-rate estimate before continuing to PayPal. The estimate is not a guaranteed or locked checkout rate.
- **PayPal Sandbox checkout** — Create and capture test payments through the PayPal Orders v2 API.
- **Receipts and activity** — Review completed sandbox payment information and transaction history.
- **Audit trail** — Keep a record of purchase decisions, conversion acceptance, and payment outcomes.
- **Account access** — Register and sign in with email/password; Google sign-in is available when configured.
- **Responsive dashboard** — View spending, saved products, approvals, integrations, and recent activity.

## How it works

1. **Describe** — Enter what you want to buy and your budget.
2. **Research** — PayPilot searches for relevant products and seller listings.
3. **Compare** — Review available verified offers and their displayed prices.
4. **Apply rules** — The API checks the request against enabled spending rules and the monthly budget.
5. **Approve** — You review the purchase details and explicitly approve or decline.
6. **Review conversion** — For the sandbox checkout flow, review and accept the INR-to-USD reference estimate.
7. **Test payment** — Continue to PayPal Sandbox and complete the test payment.
8. **Track** — View the resulting transaction, receipt information, and audit history.

> **Payment safety:** Approving a purchase request is not the same as paying for it. Approval creates an approved-pending-payment record; it does not itself create a PayPal order or capture money.

## Technology stack

| Layer | Technologies |
| --- | --- |
| Frontend | React, TypeScript, Vite |
| UI | CSS, Framer Motion, Lucide React, Recharts |
| Backend | Node.js, Express.js |
| Database | MongoDB, Mongoose |
| Authentication | JWT, bcrypt, Google Identity Services |
| AI research | OpenRouter |
| Web search | Tavily |
| Payments | PayPal Checkout Orders v2 — Sandbox |
| Currency reference | ECB reference rates via Frankfurter |
| Security | Helmet, CORS allow-list, request-size limits, rate limiting |

## Architecture

```text
Browser (React + TypeScript)
        |
        | REST API + JWT
        v
Express API (Node.js)
        |
        +---- MongoDB / Mongoose
        |
        +---- OpenRouter ---- Tavily Search
        |
        +---- Frankfurter / ECB reference rates
        |
        +---- PayPal Sandbox Orders API
```

The browser handles the user interface and PayPal SDK approval callback. Sensitive provider credentials, quote validation, order creation, capture verification, and receipt generation are handled by the server.

## Run locally

### Prerequisites

- Node.js 20 or later
- npm
- MongoDB Atlas or a local MongoDB deployment
- API credentials for the integrations you want to test

### 1. Clone the repository

```bash
git clone https://github.com/madupojumounika/paypilot.git
cd paypilot
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Copy the example file:

```bash
cp .env.example .env
```

On Windows PowerShell, you can use:

```powershell
Copy-Item .env.example .env
```

Update `.env` with the values you need:

| Variable | Purpose |
| --- | --- |
| `PORT` | API server port (default: `4000`) |
| `CLIENT_ORIGIN` | Allowed frontend origin |
| `VITE_API_URL` | API URL used by the frontend |
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Long, random secret used to sign sessions |
| `OPENROUTER_API_KEY` | Server-side AI research key |
| `OPENROUTER_MODEL` | OpenRouter model selection |
| `TAVILY_API_KEY` | Server-side web search key |
| `PAYPAL_CLIENT_ID` | PayPal Sandbox app client ID |
| `PAYPAL_CLIENT_SECRET` | PayPal Sandbox app secret — server only |
| `PAYPAL_ENVIRONMENT` | Keep set to `sandbox` |
| `VITE_PAYPAL_CLIENT_ID` | PayPal client ID used by the browser SDK |
| `VITE_GOOGLE_CLIENT_ID` | Optional Google web client ID for the frontend |
| `GOOGLE_CLIENT_ID` | Matching Google client ID used by the API |

Only configure the integrations you intend to use. AI research requires both OpenRouter and Tavily credentials. PayPal checkout requires Sandbox credentials on the server and the matching client ID in the frontend. Google sign-in is optional.

**Never commit your real `.env` file or expose server secrets in variables prefixed with `VITE_`.**

### 4. Start the backend

In one terminal:

```bash
npm run server:dev
```

The API listens on `http://localhost:4000` by default.

### 5. Start the frontend

In a second terminal:

```bash
npm run dev
```

Open the Vite URL shown in the terminal (normally `http://localhost:5173`).

## Available scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Run TypeScript project checks and build the frontend |
| `npm run preview` | Preview the production frontend build |
| `npm run server:dev` | Start the API with Node watch mode |
| `npm run server:start` | Start the API |
| `npm run check:server` | Run backend JavaScript syntax checks |
| `npm run test:server` | Run backend Node.js tests |

## API overview

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/api/health` | API health and integration status |
| POST | `/api/auth/register` | Register an account |
| POST | `/api/auth/login` | Sign in with email and password |
| POST | `/api/auth/google` | Verify Google sign-in |
| GET / PATCH | `/api/auth/me` | Read or update the signed-in profile |
| GET / POST | `/api/rules` | List or create spending rules |
| PATCH / DELETE | `/api/rules/:id` | Update or delete an owned rule |
| GET / POST | `/api/approvals` | List or submit purchase requests |
| PATCH | `/api/approvals/:id` | Approve or decline a request |
| GET | `/api/transactions` | List transactions |
| GET | `/api/audit` | Read the purchase decision audit trail |
| POST | `/api/fx/quotes` | Create a reference-rate estimate |
| POST | `/api/fx/quotes/:id/accept` | Record explicit estimate acceptance |
| POST | `/api/paypal/orders` | Create a PayPal Sandbox order |
| POST | `/api/paypal/capture` | Capture and verify a sandbox payment |
| GET | `/api/paypal/receipt/:transactionId` | Retrieve a verified completed-payment receipt |
| POST | `/api/assistant/plan` | Run AI-assisted shopping research |

Protected routes require an `Authorization: Bearer <token>` header. The shopping research endpoint is guest-accessible and rate-limited.

## Important demo and payment limitations

- **Sandbox only:** PayPal is configured for Sandbox testing. Sandbox transactions do not move real money.
- **No retailer order placement:** PayPilot's PayPal Sandbox payment is a test payment to the configured PayPilot Sandbox merchant. It does not place an order with Amazon, Flipkart, or another retailer.
- **Conversion transparency:** PayPilot displays an INR-to-USD reference estimate before checkout. This reference rate is not a locked PayPal, card, or bank exchange rate; the final checkout conversion may differ.
- **Seller data:** Retailer pages may block automated extraction or change their content. A displayed offer is not a guarantee of stock, delivery, warranty, shipping cost, or final checkout price. Confirm these details on the retailer's website before buying.
- **Integration credentials:** AI research, persistent database access, Google sign-in, and PayPal Sandbox checkout require their respective environment variables.

## Security notes

- Keep API keys, database credentials, JWT secrets, and PayPal secrets on the server.
- Use a strong, unique `JWT_SECRET` outside local development.
- Configure `CLIENT_ORIGIN` for the exact frontend origin you trust.
- Do not use real payment credentials for this demo.
- Do not commit `.env` or other files containing secrets.

## Project status

PayPilot AI is a working prototype demonstrating an AI-assisted research-to-approval workflow and a PayPal Sandbox payment integration. The project is intended for demonstration and evaluation; it is not a production financial service.

## License

No license has been specified yet. All rights remain with the repository owner unless a license is added.

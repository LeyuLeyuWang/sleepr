# GraphQL + RabbitMQ integration

This branch (`graphql-rabbitmq`) combines two of the tutorial's feature branches
into one system so the project genuinely has **both** a federated GraphQL API and
RabbitMQ-based inter-service messaging:

- **GraphQL (Apollo Federation)** — from the `graphql` branch: an `apps/gateway`
  service composes the `reservations`, `auth`, and `payments` subgraphs into a
  single GraphQL endpoint on `:3004`, with JWT auth injected via the gateway
  context.
- **RabbitMQ transport** — all inter-service communication that used to run over
  NestJS TCP now runs over RabbitMQ (`Transport.RMQ`).

## What changed vs the plain `graphql` branch

| Area | Before (graphql branch) | After (this branch) |
|------|-------------------------|---------------------|
| Service-to-service transport | `Transport.TCP` | `Transport.RMQ` (RabbitMQ) |
| RMQ wiring | — | shared `RmqModule` / `RmqService` in `libs/common/src/rmq` |
| Acknowledgements | implicit | manual `ack`/`nack` on the booking pipeline |
| Failure handling | none | dead-letter queues (`<queue>.dlq`) on `create_charge` and `notify_email` |
| Infra | mongo | mongo + `rabbitmq:3-management` |

### Message flow

```
client → GraphQL gateway (:3004)
           │  authenticate (RPC, queue "auth", auto-ack)
           ▼
         auth ── MongoDB
gateway → reservations subgraph
             │  create_charge (RPC, queue "payments", manual ack + DLQ)
             ▼
          payments → Stripe
             │  notify_email (event, queue "notifications", manual ack + DLQ)
             ▼
        notifications → email
```

### Acknowledgements & retry (the honest version)

- **`auth` queue** uses **auto-ack** (`noAck: true`). `authenticate` is a
  high-frequency RPC that can legitimately be rejected by a guard *before* the
  handler runs; auto-ack avoids stranding those messages.
- **`payments` and `notifications` queues** use **manual ack** (`noAck: false`):
  the handler `ack`s only after the work succeeds, and `nack`s to a
  **dead-letter queue** (`payments.dlq`, `notifications.dlq`) on failure, so a
  failed charge or undelivered email is parked for retry/inspection instead of
  being silently dropped. See `libs/common/src/rmq/rmq.service.ts`.

## Running locally

```bash
docker-compose up --build
```

Services: gateway `:3004`, auth `:3001`, reservations `:3000`,
RabbitMQ management UI `:15672` (guest/guest).

GraphQL playground: http://localhost:3004/graphql

## Load testing (getting an HONEST number)

Requires [k6](https://k6.io/) and the stack running.

```bash
node load-test/seed-user.js          # create the login user once
k6 run load-test/reservations-read.js
```

The test drives a **protected read path** (login → GraphQL query → RabbitMQ
authenticate → Mongo). This is bound by our own services, so its
throughput/latency is a fair measurement of the platform.

> ⚠️ Do **not** load-test the booking mutation for a headline TPS number: every
> booking makes a live Stripe API call, so that path is bounded by Stripe's
> network latency, not this system. Report the read-path number, and state the
> hardware you measured it on.

## Measured optimization (auth-path caching)

Every authenticated request resolves the JWT's user in the auth service
(`UsersService.getUser`), which was one MongoDB read per request. Adding a
short-TTL cache (`AUTH_USER_CACHE_TTL`, toggle: 0 = off) removes that read from
the hot path. A/B measured with k6 on one local node (25 VUs, 30s, read path
through gateway → RabbitMQ authenticate → Mongo):

| | Cache off | Cache on | Δ |
|---|---|---|---|
| Throughput | 272 req/s | 332 req/s | +22% |
| p95 latency | 157 ms | 114 ms | −27% |
| avg latency | 94 ms | 77 ms | −18% |

Numbers are single-laptop, co-located — fine as a relative before/after, not a
production figure. Reproduce: flip `AUTH_USER_CACHE_TTL` in `apps/auth/.env`,
`docker compose up -d --force-recreate auth`, rerun `load-test/reservations-read.js`.

## Final resume bullets (backed by this code)

**Reservation Booking System** — NestJS, TypeScript, GraphQL (Apollo Federation), RabbitMQ, MongoDB, Stripe, Docker, Kubernetes

1. Architected a reservation platform as **4 domain microservices behind an Apollo Federation GraphQL gateway**, standardizing configuration, validation, logging, Mongoose data access, authentication, and messaging in one shared library reused across every service.
2. Built a **federated GraphQL API** composing 3 subgraphs into a single endpoint, with JWT authentication (Passport.js) and role-based authorization enforced at the gateway on all protected operations.
3. Modeled the booking flow over **RabbitMQ** as a synchronous charge RPC (reservations → payments) plus an asynchronous notification event (payments → notifications), with **manual acknowledgements and per-queue dead-letter queues** so a failed charge or email is parked for retry instead of silently dropped.
4. **Cut p95 latency ~27% and raised throughput ~22%** (k6 load test) by caching per-request JWT user resolution, eliminating a MongoDB lookup on every authenticated request.
5. Integrated **Stripe payments, MongoDB, and email** behind dedicated services, containerized with **multi-stage Docker builds**, and deployed to **Kubernetes (Helm)** via **Google Cloud Build** CI/CD.

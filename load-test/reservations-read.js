// k6 load test for the Sleepr reservation platform.
//
// It exercises a realistic PROTECTED READ path end to end:
//   client -> GraphQL gateway (:3004) -> authenticate over RabbitMQ -> auth
//          -> reservations subgraph -> MongoDB
//
// This path is CPU/IO bound on our own services (no external calls), so it
// produces an honest throughput/latency number. Do NOT load-test the booking
// mutation for a headline TPS figure: each booking makes a live Stripe API
// call, so that path is bounded by Stripe's network latency, not our system.
//
// Run:
//   docker-compose up            # bring the stack up first
//   node load-test/seed-user.js  # create the login user once
//   k6 run load-test/reservations-read.js
//
// Override defaults with env vars, e.g.:
//   k6 run -e GATEWAY_URL=http://localhost:3004/graphql \
//          -e EMAIL=test@test.com -e PASSWORD='Password123!' \
//          load-test/reservations-read.js

import http from 'k6/http';
import { check } from 'k6';

const GATEWAY = __ENV.GATEWAY_URL || 'http://localhost:3004/graphql';
const AUTH_LOGIN = __ENV.AUTH_URL || 'http://localhost:3001/auth/login';
const EMAIL = __ENV.EMAIL || 'test@test.com';
const PASSWORD = __ENV.PASSWORD || 'Password123!';

export const options = {
  scenarios: {
    ramp: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 50 },
        { duration: '1m', target: 200 },
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
  },
};

export function setup() {
  const res = http.post(
    AUTH_LOGIN,
    JSON.stringify({ email: EMAIL, password: PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  check(res, { 'login succeeded': (r) => r.status === 200 || r.status === 201 });
  // POST /auth/login responds with the raw JWT string in the body.
  return { token: res.body };
}

const QUERY = JSON.stringify({
  query: 'query { reservations { _id timestamp startDate endDate } }',
});

export default function (data) {
  const res = http.post(GATEWAY, QUERY, {
    headers: {
      'Content-Type': 'application/json',
      authentication: data.token,
    },
  });
  check(res, {
    'status is 200': (r) => r.status === 200,
    'returned reservations': (r) => r.body && r.body.includes('reservations'),
  });
}

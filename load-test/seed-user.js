// Seed the login user used by the load test.
// Usage: node load-test/seed-user.js
//
// NOTE: this targets the AUTH subgraph directly (:3001/graphql), NOT the gateway.
// The gateway's authContext rejects every unauthenticated request, so the very
// first user has to be created against the subgraph, which has no gateway guard.
//
// Requires Node 18+ (global fetch). Idempotent-ish: a duplicate email returns
// an "Email already exists" error, which is safe to ignore.

const GATEWAY = process.env.SEED_URL || 'http://localhost:3001/graphql';
const EMAIL = process.env.EMAIL || 'test@test.com';
const PASSWORD = process.env.PASSWORD || 'Password123!';

const mutation = {
  query: `mutation ($email: String!, $password: String!) {
    createUser(createUserInput: { email: $email, password: $password }) { _id email }
  }`,
  variables: { email: EMAIL, password: PASSWORD },
};

fetch(GATEWAY, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(mutation),
})
  .then((r) => r.json())
  .then((body) => console.log(JSON.stringify(body, null, 2)))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

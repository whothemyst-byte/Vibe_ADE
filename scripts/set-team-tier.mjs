// Set publicMetadata.tier = "team" for specific users so they unlock the Team tier.
//
// Usage (PowerShell):
//   $env:CLERK_SECRET_KEY="sk_test_..."; node scripts/set-team-tier.mjs
// Usage (bash):
//   CLERK_SECRET_KEY=sk_test_... node scripts/set-team-tier.mjs
//
// Get the secret key from Clerk dashboard → API Keys (Secret key, sk_...).
// The two people must have signed up in the app first (the Clerk users must exist).

const SECRET = process.env.CLERK_SECRET_KEY;
if (!SECRET) {
  console.error("Missing CLERK_SECRET_KEY (Clerk dashboard → API Keys → Secret key).");
  process.exit(1);
}

const EMAILS = ["letsgogameer123@gmail.com", "whothemyst@gmail.com"];
const API = "https://api.clerk.com/v1";
const headers = { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" };

for (const email of EMAILS) {
  const lookup = await fetch(
    `${API}/users?email_address=${encodeURIComponent(email)}`,
    { headers },
  );
  if (!lookup.ok) {
    console.error(`${email}: lookup failed (${lookup.status}) ${await lookup.text()}`);
    continue;
  }
  const body = await lookup.json();
  const user = Array.isArray(body) ? body[0] : body?.data?.[0];
  if (!user) {
    console.error(`${email}: no Clerk user found — have them sign up in the app first.`);
    continue;
  }
  const patch = await fetch(`${API}/users/${user.id}/metadata`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ public_metadata: { tier: "team" } }),
  });
  if (!patch.ok) {
    console.error(`${email}: update failed (${patch.status}) ${await patch.text()}`);
    continue;
  }
  console.log(`✓ ${email}: tier=team (user ${user.id})`);
}

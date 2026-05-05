#!/usr/bin/env node
// Rolls the current Cloudflare API token via the API and writes the NEW value
// directly to ~/qualmly-cf-token.txt. The new value never touches stdout.
//
// Usage:
//   CLOUDFLARE_API_TOKEN=cfut_old... node roll-token.mjs

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const OLD = process.env.CLOUDFLARE_API_TOKEN;
if (!OLD) { console.error("CLOUDFLARE_API_TOKEN env var is empty"); process.exit(1); }

// 1. Verify the current token works + find the token id.
//    The /user/tokens/verify endpoint returns the active token's id.
const verify = await fetch("https://api.cloudflare.com/client/v4/user/tokens/verify", {
  headers: { Authorization: `Bearer ${OLD}` }
}).then(r => r.json());

if (!verify.success || !verify.result || !verify.result.id) {
  console.error("verify failed:", JSON.stringify(verify.errors || verify, null, 2));
  process.exit(2);
}
const tokenId = verify.result.id;
console.log("Found token id (last 8):", "..." + tokenId.slice(-8));

// 2. Roll the value. PUT /user/tokens/{id}/value returns the new token in
//    `result` as a plain string.
const roll = await fetch(`https://api.cloudflare.com/client/v4/user/tokens/${tokenId}/value`, {
  method: "PUT",
  headers: { Authorization: `Bearer ${OLD}`, "Content-Type": "application/json" },
  body: "{}"
}).then(r => r.json());

if (!roll.success || typeof roll.result !== "string") {
  console.error("roll failed:");
  console.error("  errors:", JSON.stringify(roll.errors || [], null, 2));
  console.error("  messages:", JSON.stringify(roll.messages || [], null, 2));
  console.error("");
  console.error("If this is a permission error, the 'Edit Cloudflare Workers'");
  console.error("template doesn't include 'User > API Tokens > Edit'. Fallback:");
  console.error("just click Roll in the dashboard manually.");
  process.exit(3);
}

const newToken = roll.result;
const outPath = path.join(os.homedir(), "qualmly-cf-token.txt");

// 3. Write to ~/qualmly-cf-token.txt with restricted perms (0600 = owner-only).
//    On Windows, mode is best-effort (NTFS ACLs ignore POSIX perms) but the
//    file ends up in C:\Users\angya\ which is already user-private by default.
fs.writeFileSync(outPath, newToken + "\n", { mode: 0o600 });

console.log("");
console.log("Rolled. New token saved to:");
console.log("  " + outPath);
console.log("");
console.log("Old token (the one in screenshots / chat) is now INVALID.");
console.log("To use the new token in any future wrangler command:");
console.log("  $env:CLOUDFLARE_API_TOKEN = (Get-Content " + outPath + ")");

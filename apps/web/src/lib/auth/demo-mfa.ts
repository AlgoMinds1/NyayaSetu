import "server-only";
import { createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

// Testing only (see /api/auth/verify): completes the authenticator step for demo accounts so the session is
// genuinely aal2 and database policies that require aal2 keep working. Stateless: each demo login replaces the
// account's factor with a fresh one and answers its own challenge, so no secret is ever stored.

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(input: string) {
  let bits = 0, value = 0; const out: number[] = [];
  for (const char of input.replace(/=+$/, "").toUpperCase()) {
    value = (value << 5) | ALPHABET.indexOf(char); bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

function totp(secret: string) {
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const hmac = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 15;
  const code = ((hmac[offset] & 127) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(code % 1_000_000).padStart(6, "0");
}

export async function autoCompleteMfa(supabase: SupabaseClient, admin: SupabaseClient, userId: string) {
  const { data: existing } = await admin.auth.admin.mfa.listFactors({ userId });
  for (const factor of existing?.factors ?? []) await admin.auth.admin.mfa.deleteFactor({ id: factor.id, userId });
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Demo auto" });
  if (error || !data) return false;
  const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: data.id, code: totp(data.totp.secret) });
  return !verifyError;
}

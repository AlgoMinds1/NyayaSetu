// Demo login code helper — run with: node --env-file=.env.local src/scripts/demo-login-code.mjs <email>
// Prints a one-time email code for a demo account, for use when email delivery is unavailable.
// Refuses non-demo emails and production. Does not print the action link or any keys.

import { createClient } from "@supabase/supabase-js";

const email = (process.argv[2] ?? "").trim().toLowerCase();

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to run: NODE_ENV is production.");
  process.exit(1);
}
if (!email.endsWith("@nyayasetu.test")) {
  console.error("Refusing: email must end with @nyayasetu.test (demo accounts only).");
  console.error("Usage: npm run demo:code -- student.demo@nyayasetu.test");
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data, error } = await supabase.auth.admin.generateLink({ type: "magiclink", email });
if (error || !data?.properties?.email_otp) {
  console.error(`generateLink failed: ${error?.message ?? "no email_otp returned"}`);
  process.exit(1);
}

console.log(`Code for ${email}: ${data.properties.email_otp}`);
console.log("Open http://localhost:3000/auth/login, enter the email, then enter this code on the verify page.");

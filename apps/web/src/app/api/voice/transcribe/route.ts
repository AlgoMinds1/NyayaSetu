// Simulated Bhashini speech-to-text. Returns a fixed transcript; no audio leaves the browser.
import { NextResponse } from "next/server";
import { getApiSession } from "@/lib/auth/api-session";

const SIMULATED_TRANSCRIPT = "Simulated transcript: The hostel fee was charged twice this semester and the refund has not been processed after two written requests.";

export async function POST() {
  const auth = await getApiSession();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ provider: "Simulated: Bhashini", transcript: SIMULATED_TRANSCRIPT });
}

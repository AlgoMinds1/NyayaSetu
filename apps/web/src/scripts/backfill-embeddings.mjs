// Embeds every complaint whose description_embedding is still null.
// Run from apps/web: node --env-file=.env.local src/scripts/backfill-embeddings.mjs
// Mirrors src/lib/overlap/embeddings.ts (plain JS so it runs without a TS loader).

import { createClient } from "@supabase/supabase-js";
import { pipeline } from "@huggingface/transformers";

const MODEL = "Xenova/paraphrase-multilingual-mpnet-base-v2";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment.");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const extractor = await pipeline("feature-extraction", MODEL);

let total = 0;
for (;;) {
  const { data, error } = await supabase
    .from("complaints")
    .select("id, description_text")
    .is("description_embedding", null)
    .order("id")
    .limit(50);
  if (error) throw error;
  if (!data?.length) break;

  for (const row of data) {
    const output = await extractor(row.description_text, { pooling: "mean", normalize: true });
    const { error: updateError } = await supabase
      .from("complaints")
      .update({ description_embedding: JSON.stringify(Array.from(output.data)) })
      .eq("id", row.id);
    if (updateError) throw updateError;
    total++;
  }
  console.log(`Embedded ${total} complaint(s) so far`);
}

console.log(`Done. ${total} complaint(s) embedded.`);

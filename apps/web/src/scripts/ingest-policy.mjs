// Ingests the policy corpus: chunk each Markdown file by `## ` heading, embed each chunk, replace its rows in policy_chunks.
// Usage (from apps/web):
//   npx tsx --conditions=react-server --env-file=.env.local src/scripts/ingest-policy.mjs ../../docs/policy-corpus
// --conditions=react-server lets the server-only guard in lib/overlap/embeddings.ts load outside Next.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { embed } from "../lib/overlap/embeddings.ts";
import { chunkMarkdown } from "../lib/rag/policy.ts";

const dir = process.argv[2];
if (!dir) {
  console.error("Usage: ingest-policy.mjs <corpus-dir>");
  process.exit(1);
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const files = (await readdir(dir)).filter((f) => f.endsWith(".md") && f.toLowerCase() !== "readme.md");
if (files.length === 0) {
  console.error(`No .md files in ${dir}`);
  process.exit(1);
}

let total = 0;
for (const file of files) {
  const markdown = await readFile(path.join(dir, file), "utf8");
  const chunks = chunkMarkdown(markdown, path.basename(file, ".md"));
  if (chunks.length === 0) {
    console.warn(`Skipping ${file}: no ## sections`);
    continue;
  }

  const rows = [];
  for (const chunk of chunks) {
    const vector = await embed(chunk.content_text);
    rows.push({ ...chunk, embedding: `[${vector.join(",")}]` });
  }

  // Replace, not append, so re-running after an edit never duplicates chunks.
  const { error: deleteError } = await supabase.from("policy_chunks").delete().eq("document_name", rows[0].document_name);
  if (deleteError) throw new Error(`Delete failed for ${file}: ${deleteError.message}`);
  const { error: insertError } = await supabase.from("policy_chunks").insert(rows);
  if (insertError) throw new Error(`Insert failed for ${file}: ${insertError.message}`);

  total += rows.length;
  console.log(`${file}: ${rows.length} chunks`);
}
console.log(`Done. ${total} chunks indexed from ${files.length} files.`);

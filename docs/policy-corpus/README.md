# Policy corpus

The policy assistant (`/aicte/assistant`) answers only from the documents indexed into `policy_chunks`.
Answers are extractive: the passages are shown verbatim with citations to this corpus. No LLM is called.

## Intended sources

| Source | Status in this repo |
|---|---|
| AICTE Approval Process Handbook (APH) 2024–27 | Not included. Add the official PDF text, cite section and page. |
| AICTE grievance-related notifications | Not included. Add official notices as Markdown. |
| UGC Regulations 2023 (grievance and student redressal provisions) | Not included. Add the official text. |
| CPGRAMS guidelines (public grievance procedure) | Not included. Add the official text. |

The files in this folder are **sample Markdown summaries written for the demo**. They paraphrase general
grievance-handling practice in our own words and are not copies of any official document.

Sample files:

- `grievance-intake.md`
- `timelines-and-escalation.md`
- `appeals.md`
- `procedure-scope.md`

## Rules for adding a document

1. Only add text you are allowed to store. Do not copy copyrighted text from official publications into the repo.
2. Start the file with a level-1 title. Each `## ` heading becomes one chunk with that heading as its section name.
3. Keep chunks short (a few paragraphs). Anything over 1,500 characters is split at paragraph breaks.
4. Re-run the ingest script after editing. It replaces every chunk for a document name, so edits do not duplicate.

## Ingest

From `apps/web`, with `.env.local` set (needs `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`):

```
npx tsx --conditions=react-server --env-file=.env.local src/scripts/ingest-policy.mjs ../../docs/policy-corpus
```

The first run downloads the embedding model used by `lib/overlap/embeddings.ts`.

Sample corpus for demo — replace with official documents.

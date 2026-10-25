// Pure helpers for the policy assistant. No I/O, so the ingest script and tests can import them directly.

/** Best-match cosine below this means the corpus does not cover the question. */
export const SIMILARITY_THRESHOLD = 0.45;
export const MAX_PASSAGES = 3;
export const ABSTAIN_MESSAGE = "Not found in the policy corpus";
export const PROCEDURE_ONLY_MESSAGE =
  "I can only explain procedure: how a complaint is filed, triaged, timed, escalated or appealed. " +
  "Whether a specific complaint is valid is a decision for the case officer, based on the evidence on file.";

const VALIDITY_QUESTION = /\b(is|are|was|will|would)\b.{0,40}\b(complaint|case|claim|grievance)\b.{0,30}\b(valid|genuine|true|fake|legit|legitimate|correct|justified|successful|succeed|accepted|rejected)\b|\bshould (we|i) (accept|reject|dismiss|close|uphold)\b|\bis (it|this|that) (valid|genuine|true|justified)\b/i;

/** Keyword guard: questions asking whether a specific complaint is valid get the procedure-only message. */
export function isValidityQuestion(question: string): boolean {
  return VALIDITY_QUESTION.test(question);
}

export type Match = { id: string; document_name: string; section: string; page: string | null; content_text: string; similarity: number };

export type Passage = { document: string; section: string; page: string | null; text: string; similarity: number };

/** Returns passages above the threshold, best first, capped at MAX_PASSAGES. Empty array means abstain. */
export function selectPassages(matches: Match[]): Passage[] {
  return [...matches]
    .filter((m) => m.similarity >= SIMILARITY_THRESHOLD)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, MAX_PASSAGES)
    .map((m) => ({ document: m.document_name, section: m.section, page: m.page, text: m.content_text, similarity: m.similarity }));
}

const MAX_CHUNK_CHARS = 1500;

export type Chunk = { document_name: string; section: string; page: string | null; content_text: string };

/** Splits Markdown at `## ` headings. Long sections are split at paragraph breaks. The `# ` title names the document. */
export function chunkMarkdown(markdown: string, fallbackDocument: string): Chunk[] {
  const lines = markdown.split(/\r?\n/);
  const titleLine = lines.find((l) => l.startsWith("# "));
  const documentName = titleLine ? titleLine.slice(2).trim() : fallbackDocument;
  const sections: { section: string; body: string[] }[] = [];
  let current: { section: string; body: string[] } | null = null;

  for (const line of lines) {
    if (line.startsWith("## ")) {
      current = { section: line.slice(3).trim(), body: [] };
      sections.push(current);
    } else if (current && !line.startsWith("# ")) {
      current.body.push(line);
    }
  }

  const chunks: Chunk[] = [];
  for (const { section, body } of sections) {
    const paragraphs = body.join("\n").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    let buffer = "";
    for (const paragraph of paragraphs) {
      if (buffer && (buffer + "\n\n" + paragraph).length > MAX_CHUNK_CHARS) {
        chunks.push({ document_name: documentName, section, page: null, content_text: buffer });
        buffer = paragraph;
      } else {
        buffer = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
      }
    }
    if (buffer) chunks.push({ document_name: documentName, section, page: null, content_text: buffer });
  }
  return chunks;
}

import { describe, expect, it } from "vitest";
import { ABSTAIN_MESSAGE, MAX_PASSAGES, SIMILARITY_THRESHOLD, chunkMarkdown, isValidityQuestion, selectPassages, type Match } from "@/lib/rag/policy";

const match = (similarity: number, section = "s"): Match => ({
  id: section, document_name: "doc", section, page: null, content_text: `text ${section}`, similarity,
});

describe("policy assistant scope guard", () => {
  it("routes validity questions to the procedure-only message", () => {
    expect(isValidityQuestion("Is this complaint valid?")).toBe(true);
    expect(isValidityQuestion("Is the case against the principal genuine")).toBe(true);
    expect(isValidityQuestion("Should we reject this case?")).toBe(true);
  });

  it("lets ordinary procedure questions through", () => {
    expect(isValidityQuestion("How long does triage take?")).toBe(false);
    expect(isValidityQuestion("How do I file an appeal after closure?")).toBe(false);
  });
});

describe("selectPassages", () => {
  it("abstains when nothing reaches the threshold", () => {
    expect(selectPassages([match(SIMILARITY_THRESHOLD - 0.01)])).toEqual([]);
    expect(ABSTAIN_MESSAGE).toBe("Not found in the policy corpus");
  });

  it("returns the best passages first and caps the count", () => {
    const picked = selectPassages([match(0.6, "a"), match(0.9, "b"), match(0.7, "c"), match(0.8, "d"), match(0.2, "e")]);
    expect(picked.map((p) => p.section)).toEqual(["b", "d", "c"].slice(0, MAX_PASSAGES));
    expect(picked).toHaveLength(MAX_PASSAGES);
  });
});

describe("chunkMarkdown", () => {
  it("chunks by heading and names the document from the title", () => {
    const md = "# Sample policy\n\nIntro text.\n\n## Intake\n\nFirst para.\n\nSecond para.\n\n## Appeals\n\nAppeal text.\n";
    const chunks = chunkMarkdown(md, "fallback");
    expect(chunks.map((c) => c.section)).toEqual(["Intake", "Appeals"]);
    expect(chunks[0].document_name).toBe("Sample policy");
    expect(chunks[0].content_text).toBe("First para.\n\nSecond para.");
  });

  it("splits long sections at paragraph breaks", () => {
    const para = "x".repeat(900);
    const chunks = chunkMarkdown(`## Long\n\n${para}\n\n${para}\n`, "doc");
    expect(chunks).toHaveLength(2);
    expect(chunks[0].document_name).toBe("doc");
  });
});

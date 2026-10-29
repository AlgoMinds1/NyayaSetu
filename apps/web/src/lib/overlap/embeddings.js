import "server-only";
import { pipeline } from "@huggingface/transformers";
// 768-dim multilingual sentence model; matches complaints.description_embedding vector(768).
export const EMBEDDING_MODEL = "Xenova/paraphrase-multilingual-mpnet-base-v2";
export const EMBEDDING_DIM = 768;
let extractorPromise = null;
function getExtractor() {
    extractorPromise ??= pipeline("feature-extraction", EMBEDDING_MODEL);
    return extractorPromise;
}
export async function embed(text) {
    const extractor = await getExtractor();
    const output = await extractor(text, { pooling: "mean", normalize: true });
    return Array.from(output.data);
}
export { cosine } from "./scoring";

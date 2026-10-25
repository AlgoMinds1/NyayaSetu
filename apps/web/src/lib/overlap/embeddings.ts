import "server-only";
import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";

// 768-dim multilingual sentence model; matches complaints.description_embedding vector(768).
export const EMBEDDING_MODEL = "Xenova/paraphrase-multilingual-mpnet-base-v2";
export const EMBEDDING_DIM = 768;

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

function getExtractor() {
  extractorPromise ??= pipeline("feature-extraction", EMBEDDING_MODEL) as Promise<FeatureExtractionPipeline>;
  return extractorPromise;
}

export async function embed(text: string): Promise<number[]> {
  const extractor = await getExtractor();
  const output = await extractor(text, { pooling: "mean", normalize: true });
  return Array.from(output.data as Float32Array);
}

export { cosine } from "./scoring";

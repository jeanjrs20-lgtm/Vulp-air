const DIMENSION = 384;

let extractorPromise: Promise<any> | null = null;

const createDeterministicVector = (text: string) => {
  const vector = Array.from({ length: DIMENSION }, () => 0);

  for (let i = 0; i < text.length; i += 1) {
    const index = i % DIMENSION;
    vector[index] += text.charCodeAt(i) / 255;
  }

  const norm = Math.sqrt(vector.reduce((acc, value) => acc + value * value, 0)) || 1;
  return vector.map((value) => Number((value / norm).toFixed(6)));
};

const toVector = (value: any) => {
  if (Array.isArray(value)) {
    return value;
  }
  if (value?.data && Array.isArray(value.data)) {
    return value.data;
  }
  if (value?.tolist) {
    return value.tolist();
  }
  return [];
};

const getExtractor = async () => {
  if (!extractorPromise) {
    const { pipeline } = await import("@xenova/transformers");
    extractorPromise = pipeline(
      "feature-extraction",
      "Xenova/paraphrase-multilingual-MiniLM-L12-v2"
    );
  }

  return extractorPromise;
};

export const embedText = async (text: string) => {
  try {
    const extractor = await getExtractor();
    const output = await extractor(text, { pooling: "mean", normalize: true });
    const parsed = toVector(output);

    if (!parsed.length) {
      return createDeterministicVector(text);
    }

    return parsed.slice(0, DIMENSION).map((value: number) => Number(value.toFixed(6)));
  } catch {
    return createDeterministicVector(text);
  }
};

export const vectorToSqlLiteral = (vector: number[]) => {
  return `[${vector.join(",")}]`;
};

import { z } from "zod";

const chunkSize = 1000;
const overlap = 120;

export const splitTextIntoChunks = (text: string) => {
  const content = text.replace(/\s+/g, " ").trim();
  if (!content) {
    return [];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < content.length) {
    const end = Math.min(content.length, start + chunkSize);
    const piece = content.slice(start, end);
    chunks.push(piece);
    if (end === content.length) {
      break;
    }
    start = end - overlap;
  }

  return chunks;
};

export const FiltersSchema = z.object({
  category: z.string().optional(),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional(),
  tags: z.array(z.string()).optional()
});

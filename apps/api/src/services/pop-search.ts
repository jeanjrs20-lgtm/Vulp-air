import type { PrismaClient } from "@prisma/client";
import { splitTextIntoChunks } from "../lib/text.js";

const stripNewLines = (value: string) => value.replace(/\s+/g, " ").trim();

export const extractPdfContent = async (buffer: Buffer) => {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { createCanvas } = await import("@napi-rs/canvas");

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableWorker: true
  } as any);

  const pdf = await loadingTask.promise;

  const pages: Array<{ page: number; text: string }> = [];
  let thumbnail: Buffer | null = null;

  for (let index = 1; index <= pdf.numPages; index += 1) {
    const page = await pdf.getPage(index);
    const textContent = await page.getTextContent();
    const text = stripNewLines(
      (textContent.items as Array<{ str?: string }>)
        .map((item) => item.str ?? "")
        .join(" ")
    );

    pages.push({ page: index, text });

    if (index === 1) {
      const viewport = page.getViewport({ scale: 1.4 });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const context = canvas.getContext("2d");

      await page.render({
        canvasContext: context as never,
        viewport
      } as never).promise;

      thumbnail = canvas.toBuffer("image/png");
    }
  }

  return { pages, thumbnail };
};

export const ensurePopVectorInfrastructure = async (prisma: PrismaClient) => {
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_popchunk_tsv ON "PopChunk" USING GIN (tsv)`);
};

export const ingestPopChunks = async (
  prisma: PrismaClient,
  params: {
    popId: string;
    pages: Array<{ page: number; text: string }>;
  }
) => {
  await ensurePopVectorInfrastructure(prisma);

  let order = 1;

  for (const page of params.pages) {
    const chunks = splitTextIntoChunks(page.text);

    for (const content of chunks) {
      const created = await prisma.popChunk.create({
        data: {
          popId: params.popId,
          content,
          page: page.page,
          chunkOrder: order
        }
      });

      await prisma.$executeRawUnsafe(
        `UPDATE "PopChunk"
         SET tsv = to_tsvector('portuguese', $1)
         WHERE id = $2`,
        content,
        created.id
      );

      order += 1;
    }
  }
};

const highlightSnippet = (content: string, query: string) => {
  const words = query
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 2);

  const lower = content.toLowerCase();
  let position = 0;

  for (const word of words) {
    const idx = lower.indexOf(word.toLowerCase());
    if (idx >= 0) {
      position = idx;
      break;
    }
  }

  const start = Math.max(0, position - 70);
  const end = Math.min(content.length, position + 160);
  let snippet = content.slice(start, end);

  for (const word of words) {
    const regex = new RegExp(`(${word})`, "gi");
    snippet = snippet.replace(regex, "<mark>$1</mark>");
  }

  return snippet;
};

export const searchPopHybrid = async (
  prisma: PrismaClient,
  params: {
    query: string;
    category?: string;
    status?: "DRAFT" | "ACTIVE" | "ARCHIVED";
    tags?: string[];
  }
) => {
  try {
    const rows = (await prisma.$queryRawUnsafe(
      `
      SELECT
        p.id AS "popId",
        p.title,
        p."thumbnailAssetId",
        p.tags,
        p.status,
        c.content,
        (
          COALESCE(ts_rank(c.tsv, websearch_to_tsquery('portuguese', $1)), 0) +
          CASE WHEN c.content ILIKE ('%' || $1 || '%') THEN 0.2 ELSE 0 END +
          CASE WHEN p.title ILIKE ('%' || $1 || '%') THEN 0.4 ELSE 0 END
        ) AS score
      FROM "PopChunk" c
      JOIN "PopDocument" p ON p.id = c."popId"
      WHERE ($2::text IS NULL OR p.category = $2)
        AND ($3::text IS NULL OR p.status::text = $3)
        AND (
          c.tsv @@ websearch_to_tsquery('portuguese', $1)
          OR c.content ILIKE ('%' || $1 || '%')
          OR p.title ILIKE ('%' || $1 || '%')
        )
      ORDER BY score DESC
      LIMIT 80
      `,
      params.query,
      params.category ?? null,
      params.status ?? null
    )) as Array<{
      popId: string;
      title: string;
      thumbnailAssetId: string | null;
      tags: string[];
      status: string;
      content: string;
      score: number;
    }>;

    const filtered = params.tags?.length
      ? rows.filter((row) => row.tags.some((tag) => params.tags!.includes(tag)))
      : rows;

    const grouped = new Map<string, (typeof filtered)[number]>();
    for (const row of filtered) {
      const current = grouped.get(row.popId);
      if (!current || current.score < row.score) {
        grouped.set(row.popId, row);
      }
    }

    const results = Array.from(grouped.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 25)
      .map((row) => ({
        popId: row.popId,
        title: row.title,
        thumbnailAssetId: row.thumbnailAssetId,
        score: Number(row.score.toFixed(4)),
        snippets: [highlightSnippet(row.content, params.query)]
      }));

    return results;
  } catch {
    const fallback = await prisma.popDocument.findMany({
      where: {
        ...(params.category ? { category: params.category } : {}),
        ...(params.status ? { status: params.status } : {}),
        ...(params.tags?.length ? { tags: { hasSome: params.tags } } : {}),
        OR: [
          { title: { contains: params.query, mode: "insensitive" } },
          {
            chunks: {
              some: {
                content: {
                  contains: params.query,
                  mode: "insensitive"
                }
              }
            }
          }
        ]
      },
      include: {
        chunks: {
          take: 1
        }
      },
      take: 20
    });

    return fallback.map((item) => ({
      popId: item.id,
      title: item.title,
      thumbnailAssetId: item.thumbnailAssetId,
      score: 0.5,
      snippets: [highlightSnippet(item.chunks[0]?.content ?? item.title, params.query)]
    }));
  }
};

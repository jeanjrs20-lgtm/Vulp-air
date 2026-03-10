import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { AppError } from "./app-error.js";
import { env } from "../env.js";

const rootPath = path.resolve(process.cwd(), env.STORAGE_LOCAL_PATH);
const isS3Storage = env.STORAGE_DRIVER === "s3";

const s3Client = isS3Storage
  ? new S3Client({
      region: env.STORAGE_S3_REGION,
      endpoint: env.STORAGE_S3_ENDPOINT,
      forcePathStyle: env.STORAGE_S3_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: env.STORAGE_S3_ACCESS_KEY_ID!,
        secretAccessKey: env.STORAGE_S3_SECRET_ACCESS_KEY!
      }
    })
  : null;

const normalizeStorageKey = (value: string) => value.replace(/\\/g, "/").replace(/^\/+/, "");

const resolveLocalPath = (storageKey: string) => {
  const normalized = normalizeStorageKey(storageKey);
  const fullPath = path.resolve(rootPath, normalized);
  if (!fullPath.startsWith(rootPath)) {
    throw new AppError(400, "INVALID_PATH", "Path invalido");
  }
  return fullPath;
};

const bodyToBuffer = async (body: unknown) => {
  if (!body) {
    return Buffer.alloc(0);
  }

  if (Buffer.isBuffer(body)) {
    return body;
  }

  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }

  if (typeof body === "string") {
    return Buffer.from(body);
  }

  if (typeof body === "object" && body !== null && "transformToByteArray" in body) {
    const bytes = await (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray();
    return Buffer.from(bytes);
  }

  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array | Buffer | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

export const getStorageAbsolutePath = () => rootPath;

export const toPublicAssetUrl = (storageKey: string) => `/api/v1/media/file/${normalizeStorageKey(storageKey)}`;

export const saveLocalFile = async (params: {
  folder: string;
  originalName: string;
  buffer: Buffer;
  contentType?: string;
}) => {
  const extension = path.extname(params.originalName) || "";
  const fileName = `${Date.now()}-${randomUUID()}${extension}`;
  const safeFolder = params.folder.replace(/[^a-zA-Z0-9\-_\/]/g, "_").replace(/\/+/g, "/");
  const storageKey = normalizeStorageKey(path.posix.join(safeFolder, fileName));

  if (!isS3Storage) {
    const fullPath = resolveLocalPath(storageKey);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, params.buffer);

    return {
      storageKey,
      fullPath
    };
  }

  await s3Client!.send(
    new PutObjectCommand({
      Bucket: env.STORAGE_S3_BUCKET,
      Key: storageKey,
      Body: params.buffer,
      ContentType: params.contentType
    })
  );

  return {
    storageKey,
    fullPath: storageKey
  };
};

export const readStoredFileBuffer = async (storageKey: string) => {
  const normalized = normalizeStorageKey(storageKey);

  if (!isS3Storage) {
    return readFile(resolveLocalPath(normalized));
  }

  const response = await s3Client!.send(
    new GetObjectCommand({
      Bucket: env.STORAGE_S3_BUCKET,
      Key: normalized
    })
  );

  return bodyToBuffer(response.Body);
};

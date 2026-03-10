import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { env } from "../env.js";

const rootPath = path.resolve(process.cwd(), env.STORAGE_LOCAL_PATH);

export const getStorageAbsolutePath = () => rootPath;

export const toPublicAssetUrl = (storageKey: string) => `/api/v1/media/file/${storageKey}`;

export const saveLocalFile = async (params: {
  folder: string;
  originalName: string;
  buffer: Buffer;
}) => {
  const extension = path.extname(params.originalName) || "";
  const fileName = `${Date.now()}-${randomUUID()}${extension}`;
  const safeFolder = params.folder.replace(/[^a-zA-Z0-9\-_]/g, "_");
  const relativeDir = path.join(safeFolder);
  const fullDir = path.join(rootPath, relativeDir);

  await mkdir(fullDir, { recursive: true });

  const fullFilePath = path.join(fullDir, fileName);
  await writeFile(fullFilePath, params.buffer);

  return {
    storageKey: path.join(relativeDir, fileName).replace(/\\/g, "/"),
    fullPath: fullFilePath
  };
};

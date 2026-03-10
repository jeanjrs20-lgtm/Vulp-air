"use client";

const LOCAL_API_ORIGIN = "http://localhost:3001";
const API_PREFIX = "/api/v1";

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

export const getApiBaseUrl = () => {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (configured) {
    return trimTrailingSlash(configured);
  }

  if (process.env.NODE_ENV === "development") {
    return `${LOCAL_API_ORIGIN}${API_PREFIX}`;
  }

  return API_PREFIX;
};

export const getApiOrigin = () => {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (configured) {
    return trimTrailingSlash(configured).replace(/\/api\/v1$/, "");
  }

  if (process.env.NODE_ENV === "development") {
    return LOCAL_API_ORIGIN;
  }

  return "";
};

export const toApiAssetUrl = (path: string) => {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getApiOrigin()}${normalizedPath}`;
};

export const toMediaFileUrl = (storageKey: string) =>
  `${getApiOrigin()}${API_PREFIX}/media/file/${storageKey}`;

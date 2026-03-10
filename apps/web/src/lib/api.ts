"use client";

import { createApiClient } from "@vulp/api-client";
import { authStorage } from "./auth-storage";
import { getApiBaseUrl } from "./public-api";

export const api = createApiClient({
  baseUrl: getApiBaseUrl(),
  getToken: () => authStorage.getToken()
});

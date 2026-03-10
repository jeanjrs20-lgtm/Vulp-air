import { Platform } from "react-native";
import { createApiClient } from "@vulp/api-client";
import { authStore } from "./auth";

const resolveApiUrl = () => {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl) {
    return envUrl;
  }

  if (Platform.OS === "android") {
    return "http://10.0.2.2:3001/api/v1";
  }

  return "http://localhost:3001/api/v1";
};

export const apiBaseUrl = resolveApiUrl();

export const api = createApiClient({
  baseUrl: apiBaseUrl,
  getToken: () => authStore.getToken()
});

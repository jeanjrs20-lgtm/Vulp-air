import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "vulp_air_token";
const USER_KEY = "vulp_air_user";

export const authStore = {
  async getToken() {
    return SecureStore.getItemAsync(TOKEN_KEY);
  },
  async setToken(token: string) {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  },
  async clearToken() {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  },
  async getUser() {
    const raw = await SecureStore.getItemAsync(USER_KEY);
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },
  async setUser(user: unknown) {
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
  },
  async logout() {
    await this.clearToken();
    await SecureStore.deleteItemAsync(USER_KEY);
  }
};

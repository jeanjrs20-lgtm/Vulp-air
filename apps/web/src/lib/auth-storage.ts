"use client";

const TOKEN_KEY = "vulp_air_token";
const USER_KEY = "vulp_air_user";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export const authStorage = {
  getToken() {
    if (typeof window === "undefined") {
      return null;
    }

    return localStorage.getItem(TOKEN_KEY);
  },
  setToken(token: string) {
    if (typeof window === "undefined") {
      return;
    }

    localStorage.setItem(TOKEN_KEY, token);
  },
  clearToken() {
    if (typeof window === "undefined") {
      return;
    }

    localStorage.removeItem(TOKEN_KEY);
  },
  getUser(): SessionUser | null {
    if (typeof window === "undefined") {
      return null;
    }

    const raw = localStorage.getItem(USER_KEY);
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as SessionUser;
    } catch {
      return null;
    }
  },
  setUser(user: SessionUser) {
    if (typeof window === "undefined") {
      return;
    }

    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clearUser() {
    if (typeof window === "undefined") {
      return;
    }

    localStorage.removeItem(USER_KEY);
  },
  logout() {
    this.clearToken();
    this.clearUser();
  }
};

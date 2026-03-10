"use client";

import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { authStore } from "@/src/lib/auth";

export default function IndexPage() {
  const [token, setToken] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    authStore.getToken().then(setToken);
  }, []);

  if (token === undefined) {
    return null;
  }

  if (!token) {
    return <Redirect href="/login" />;
  }

  return <Redirect href="/(tabs)/dashboard" />;
}

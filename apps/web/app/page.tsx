"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { authStorage } from "@/lib/auth-storage";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    if (authStorage.getToken()) {
      router.replace("/dashboard");
      return;
    }

    router.replace("/login");
  }, [router]);

  return null;
}

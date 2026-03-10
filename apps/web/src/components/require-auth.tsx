"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { authStorage } from "@/lib/auth-storage";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    if (!authStorage.getToken()) {
      router.replace("/login");
    }
  }, [router]);

  return <>{children}</>;
}

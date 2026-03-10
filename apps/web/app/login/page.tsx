"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { BrandLockup } from "@/components/brand-lockup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { authStorage } from "@/lib/auth-storage";

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

type LoginInput = z.infer<typeof LoginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const form = useForm<LoginInput>({
    resolver: zodResolver(LoginSchema),
    defaultValues: {
      email: "superadmin@vulp.local",
      password: "123456"
    }
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.post<{ token: string; user: any }>("/auth/login", values);
      authStorage.setToken(response.token);
      authStorage.setUser(response.user);
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao autenticar");
    } finally {
      setLoading(false);
    }
  });

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-md p-6">
        <BrandLockup className="mb-6" />
        <form className="space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="mb-1 block text-sm font-semibold text-brand-primary">E-mail</label>
            <Input type="email" {...form.register("email")} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-brand-primary">Senha</label>
            <Input type="password" {...form.register("password")} />
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button className="w-full" disabled={loading} type="submit">
            {loading ? "Entrando..." : "Entrar"}
          </Button>
          <div className="space-y-1 text-xs text-slate-500">
            <p>Demo super admin: superadmin@vulp.local / 123456</p>
            <p>Demo tecnico: tecnico@vulp.local / 123456</p>
          </div>
        </form>
      </div>
    </div>
  );
}

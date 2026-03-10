"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { BrandLockup } from "@/components/brand-lockup";
import { RequireAuth } from "@/components/require-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { authStorage } from "@/lib/auth-storage";
import { getApiBaseUrl, toMediaFileUrl } from "@/lib/public-api";

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);

  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.get<any>("/settings")
  });

  const brandingMutation = useMutation({
    mutationFn: (payload: any) => api.patch("/settings/branding", payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings"] })
  });

  const smtpMutation = useMutation({
    mutationFn: (payload: any) => api.patch("/settings/smtp", payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings"] })
  });

  const settings = settingsQuery.data;
  const colors = settings?.brandingColors ?? {};

  const handleLogoUpload = async (file: File) => {
    setUploading(true);
    try {
      const token = authStorage.getToken();
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "branding");
      formData.append("title", "Logo oficial");
      formData.append("tags", "branding,logo");

      const response = await fetch(`${getApiBaseUrl()}/media/upload`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData
      });

      const payload = await response.json();
      if (!response.ok || payload.error) {
        throw new Error(payload.error?.message ?? "Falha no upload do logo");
      }

      await brandingMutation.mutateAsync({
        logoAssetId: payload.data.id,
        useBrandLockup: false
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <RequireAuth>
      <AppShell>
        <h1 className="mb-4 text-2xl font-black text-brand-primary">Configurações</h1>

        <section className="card mb-4 p-4">
          <h2 className="mb-2 text-lg font-bold text-brand-primary">Branding</h2>
          <div className="mb-4 grid gap-2 md:grid-cols-5">
            {[
              ["primary", "Primária"],
              ["background", "Background"],
              ["highlight", "Highlight"],
              ["textOnDark", "Texto escuro"],
              ["neutralBg", "Neutro"]
            ].map(([key, label]) => (
              <label className="text-xs font-semibold" key={key}>
                {label}
                <Input defaultValue={colors[key]} id={`color-${key}`} type="color" />
              </label>
            ))}
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Button
              onClick={() => {
                const payload = {
                  brandingColors: {
                    primary: (document.getElementById("color-primary") as HTMLInputElement).value,
                    background: (document.getElementById("color-background") as HTMLInputElement).value,
                    highlight: (document.getElementById("color-highlight") as HTMLInputElement).value,
                    textOnDark: (document.getElementById("color-textOnDark") as HTMLInputElement).value,
                    neutralBg: (document.getElementById("color-neutralBg") as HTMLInputElement).value
                  }
                };
                brandingMutation.mutate(payload);
              }}
            >
              Salvar cores
            </Button>

            <Button onClick={() => brandingMutation.mutate({ useBrandLockup: true })} variant="outline">
              Usar BrandLockup
            </Button>

            <label className="inline-flex cursor-pointer items-center rounded-xl border border-brand-primary px-3 py-2 text-sm font-semibold text-brand-primary">
              {uploading ? "Enviando logo..." : "Upload Logo"}
              <input
                accept="image/png,image/svg+xml"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void handleLogoUpload(file);
                  }
                }}
                type="file"
              />
            </label>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            {settings?.useBrandLockup || !settings?.logoAsset?.storageKey ? (
              <BrandLockup />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt="Logo oficial"
                className="h-16 object-contain"
                src={toMediaFileUrl(settings.logoAsset.storageKey)}
              />
            )}
          </div>
        </section>

        <section className="card p-4">
          <h2 className="mb-2 text-lg font-bold text-brand-primary">SMTP (MailHog local)</h2>
          <form
            className="grid gap-3 md:grid-cols-3"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              smtpMutation.mutate({
                smtpHost: form.get("smtpHost"),
                smtpPort: Number(form.get("smtpPort")),
                smtpFrom: form.get("smtpFrom")
              });
            }}
          >
            <Input defaultValue={settings?.smtpHost ?? "localhost"} name="smtpHost" placeholder="SMTP host" />
            <Input defaultValue={settings?.smtpPort ?? 1025} name="smtpPort" placeholder="SMTP port" type="number" />
            <Input
              defaultValue={settings?.smtpFrom ?? "VULP AIR <no-reply@local>"}
              name="smtpFrom"
              placeholder="SMTP from"
            />
            <Button className="md:col-span-3" type="submit" variant="outline">
              Salvar SMTP
            </Button>
          </form>
        </section>
      </AppShell>
    </RequireAuth>
  );
}

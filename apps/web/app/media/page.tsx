"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { RequireAuth } from "@/components/require-auth";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { toMediaFileUrl } from "@/lib/public-api";

export default function MediaPage() {
  const [type, setType] = useState("");
  const [tags, setTags] = useState("");

  const query = useQuery({
    queryKey: ["media-library", type, tags],
    queryFn: () =>
      api.get<any[]>(
        `/media?${new URLSearchParams({
          ...(type ? { type } : {}),
          ...(tags ? { tags } : {})
        }).toString()}`
      )
  });

  return (
    <RequireAuth>
      <AppShell>
        <h1 className="mb-4 text-2xl font-black text-brand-primary">Biblioteca de Mídia</h1>
        <div className="card mb-4 grid gap-3 p-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-bold uppercase">Tipo</label>
            <select className="w-full rounded-xl border px-3 py-2" onChange={(event) => setType(event.target.value)} value={type}>
              <option value="">Todos</option>
              <option value="PHOTO">Foto</option>
              <option value="PDF">PDF</option>
              <option value="THUMBNAIL">Thumbnail</option>
              <option value="SIGNATURE">Assinatura</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold uppercase">Tags</label>
            <Input onChange={(event) => setTags(event.target.value)} placeholder="ex: pop, limpeza" value={tags} />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {(query.data ?? []).map((asset) => (
            <article className="card p-3" key={asset.id}>
              <p className="text-xs font-bold uppercase text-brand-primary">{asset.type}</p>
              <p className="mb-1 text-sm font-semibold">{asset.title ?? asset.storageKey}</p>
              <p className="mb-2 text-xs text-slate-500">{asset.tags?.join(", ") || "sem tags"}</p>
              {asset.type === "PDF" ? (
                <a
                  className="text-sm font-semibold text-brand-primary underline"
                  href={toMediaFileUrl(asset.storageKey)}
                  rel="noreferrer"
                  target="_blank"
                >
                  Abrir PDF
                </a>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt={asset.title ?? asset.storageKey}
                  className="h-36 w-full rounded-xl object-cover"
                  src={toMediaFileUrl(asset.storageKey)}
                />
              )}
            </article>
          ))}
        </div>
      </AppShell>
    </RequireAuth>
  );
}

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ScrollView, Text, TextInput, TouchableOpacity } from "react-native";
import { api, apiBaseUrl } from "@/src/lib/api";
import { PopPreviewModal } from "@/src/components/pop-preview-modal";

export default function PopsTab() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<any>(null);

  const listQuery = useQuery({
    queryKey: ["mobile-pops-list"],
    queryFn: () => api.get<any[]>("/pops")
  });

  const searchQuery = useQuery({
    queryKey: ["mobile-pops-search", search],
    queryFn: () => api.get<any[]>(`/pops/search?q=${encodeURIComponent(search)}`),
    enabled: search.trim().length > 1
  });

  const ackMutation = useMutation({
    mutationFn: (popId: string) => api.post(`/pops/${popId}/ack`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mobile-pops-list"] })
  });

  const data = search.trim().length > 1 ? searchQuery.data ?? [] : listQuery.data ?? [];

  return (
    <ScrollView className="flex-1 bg-brand-neutralBg px-4 pt-12">
      <Text className="text-2xl font-black text-brand-primary">POP / FAQ</Text>
      <Text className="mb-3 text-xs text-slate-600">Toque para preview da 1ª página e ações</Text>

      <TextInput
        className="mb-3 rounded-xl border border-slate-300 bg-white px-3 py-2"
        onChangeText={setSearch}
        placeholder="Buscar POP"
        value={search}
      />

      {data.map((item: any) => {
        const normalized = item.popId
          ? {
              ...item,
              id: item.popId,
              thumbnailUrl: item.thumbnailUrl ? `${apiBaseUrl.replace('/api/v1', '')}${item.thumbnailUrl}` : undefined,
              pdfUrl: item.pdfUrl ? `${apiBaseUrl.replace('/api/v1', '')}${item.pdfUrl}` : undefined
            }
          : {
              ...item,
              thumbnailUrl: item.thumbnailUrl ? `${apiBaseUrl.replace('/api/v1', '')}${item.thumbnailUrl}` : undefined,
              pdfUrl: item.pdfUrl ? `${apiBaseUrl.replace('/api/v1', '')}${item.pdfUrl}` : undefined
            };

        return (
          <TouchableOpacity
            className="mb-2 rounded-2xl bg-white p-3"
            key={normalized.id}
            onPress={async () => {
              const detail = await api.get<any>(`/pops/${normalized.id}`);
              setSelected({
                ...normalized,
                ...detail,
                thumbnailUrl: detail.thumbnailUrl ? `${apiBaseUrl.replace('/api/v1', '')}${detail.thumbnailUrl}` : undefined,
                pdfUrl: detail.pdfUrl ? `${apiBaseUrl.replace('/api/v1', '')}${detail.pdfUrl}` : undefined
              });
            }}
          >
            <Text className="text-base font-bold text-brand-primary">{normalized.title}</Text>
            <Text className="text-xs text-slate-500">{normalized.score ? `score ${normalized.score}` : normalized.category}</Text>
          </TouchableOpacity>
        );
      })}

      <PopPreviewModal
        item={selected}
        onAck={() => {
          if (selected?.id) {
            ackMutation.mutate(selected.id);
          }
        }}
        onClose={() => setSelected(null)}
        visible={Boolean(selected)}
      />
    </ScrollView>
  );
}

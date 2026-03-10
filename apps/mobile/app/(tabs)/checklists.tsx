import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { api } from "@/src/lib/api";
import { ChecklistWizardModal } from "@/src/components/checklist-wizard-modal";

export default function ChecklistsTab() {
  const queryClient = useQueryClient();
  const [selectedExecution, setSelectedExecution] = useState<any>(null);

  const query = useQuery({
    queryKey: ["mobile-checklists"],
    queryFn: () => api.get<any[]>("/checklists/executions/my")
  });

  const saveProgressMutation = useMutation({
    mutationFn: (payload: any) => api.patch(`/checklists/executions/${selectedExecution.id}/progress`, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mobile-checklists"] })
  });

  const submitMutation = useMutation({
    mutationFn: () => api.post(`/checklists/executions/${selectedExecution.id}/submit`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mobile-checklists"] })
  });

  return (
    <ScrollView className="flex-1 bg-brand-neutralBg px-4 pt-12">
      <Text className="text-2xl font-black text-brand-primary">Meus atendimentos</Text>
      <Text className="mb-4 text-xs text-slate-600">Execução em jornada com salvamento de progresso</Text>

      {(query.data ?? []).map((execution: any) => (
        <TouchableOpacity
          className="mb-2 rounded-2xl bg-white p-4"
          key={execution.id}
          onPress={() => setSelectedExecution(execution)}
        >
          <Text className="text-lg font-black text-brand-primary">{execution.code}</Text>
          <Text className="text-sm text-slate-600">
            {execution.customer?.name ?? "Sem cliente"} | {execution.status}
          </Text>
          <Text className="text-xs text-slate-500">Etapa atual: {execution.step}</Text>
        </TouchableOpacity>
      ))}

      <ChecklistWizardModal
        execution={selectedExecution}
        onClose={() => setSelectedExecution(null)}
        onSave={async (payload) => {
          await saveProgressMutation.mutateAsync(payload);
        }}
        onSubmit={async () => {
          await submitMutation.mutateAsync();
        }}
        visible={Boolean(selectedExecution)}
      />
    </ScrollView>
  );
}

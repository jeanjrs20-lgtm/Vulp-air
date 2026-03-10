import { useQuery } from "@tanstack/react-query";
import { ScrollView, Text, View } from "react-native";
import { api } from "@/src/lib/api";

export default function DashboardTab() {
  const query = useQuery({
    queryKey: ["mobile-dashboard"],
    queryFn: () => api.get<any>("/dashboard/kpis")
  });

  const data = query.data;
  const cards = [
    ["Pendentes", data?.kpis?.pending ?? 0],
    ["Em execução", data?.kpis?.inProgress ?? 0],
    ["Submetidos", data?.kpis?.submitted ?? 0],
    ["Aprovados", data?.kpis?.approved ?? 0],
    ["Reprovados", data?.kpis?.rejected ?? 0],
    ["Reabertos", data?.kpis?.reopened ?? 0]
  ];

  return (
    <ScrollView className="flex-1 bg-brand-neutralBg px-4 pt-12">
      <Text className="text-2xl font-black text-brand-primary">Dashboard</Text>
      <Text className="mb-4 text-xs text-slate-600">Visão geral operacional</Text>

      <View className="mb-3 flex-row flex-wrap gap-2">
        {cards.map(([label, value]) => (
          <View className="w-[48%] rounded-2xl bg-white p-3" key={label}>
            <Text className="text-xs text-slate-500">{label}</Text>
            <Text className="text-2xl font-black text-brand-primary">{value}</Text>
          </View>
        ))}
      </View>

      <View className="rounded-2xl bg-white p-3">
        <Text className="mb-2 text-sm font-bold text-brand-primary">Tempo médio</Text>
        <Text className="text-sm text-slate-700">Execução: {Number(data?.kpis?.avgExecutionMinutes ?? 0).toFixed(1)} min</Text>
        <Text className="text-sm text-slate-700">Revisão: {Number(data?.kpis?.avgReviewMinutes ?? 0).toFixed(1)} min</Text>
      </View>
    </ScrollView>
  );
}

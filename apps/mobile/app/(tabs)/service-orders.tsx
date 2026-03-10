import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import * as Location from "expo-location";
import { api } from "@/src/lib/api";

type ServiceOrderStatus =
  | "OPEN"
  | "SCHEDULED"
  | "DISPATCHED"
  | "IN_PROGRESS"
  | "ON_HOLD"
  | "COMPLETED"
  | "CANCELLED";

type ServiceOrderItem = {
  id: string;
  code: string;
  title: string;
  status: ServiceOrderStatus;
  scheduledStartAt?: string | null;
  serviceDate?: string | null;
  assignedTechnician?: { id: string; name: string } | null;
  customer?: { id: string; name: string } | null;
};

type LocationPoint = {
  id: string;
  type: "CHECK_IN" | "CHECK_OUT" | "PING";
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  capturedAt: string;
};

const STATUS_META: Record<ServiceOrderStatus, string> = {
  OPEN: "Aberta",
  SCHEDULED: "Agendada",
  DISPATCHED: "Despachada",
  IN_PROGRESS: "Em execucao",
  ON_HOLD: "Em espera",
  COMPLETED: "Concluida",
  CANCELLED: "Cancelada"
};

const toDateLabel = (value?: string | null) => {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("pt-BR");
};

export default function ServiceOrdersTab() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const ordersQuery = useQuery({
    queryKey: ["mobile-service-orders"],
    queryFn: () => api.get<ServiceOrderItem[]>("/service-orders")
  });

  const traceQuery = useQuery({
    queryKey: ["mobile-service-order-trace", selectedId],
    queryFn: () => api.get<LocationPoint[]>(`/service-orders/${selectedId}/location-trace`),
    enabled: Boolean(selectedId)
  });

  const selectedOrder = useMemo(
    () => (ordersQuery.data ?? []).find((item) => item.id === selectedId) ?? null,
    [ordersQuery.data, selectedId]
  );

  const refreshOrders = () => {
    queryClient.invalidateQueries({ queryKey: ["mobile-service-orders"] });
    if (selectedId) {
      queryClient.invalidateQueries({ queryKey: ["mobile-service-order-trace", selectedId] });
    }
  };

  const getCoordinatesPayload = async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      throw new Error("Permissao de localizacao negada");
    }

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High
    });

    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      speed: position.coords.speed ?? undefined,
      heading: position.coords.heading ?? undefined,
      source: "MOBILE_APP"
    };
  };

  const checkInMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const payload = await getCoordinatesPayload();
      return api.post(`/service-orders/${orderId}/check-in`, payload);
    },
    onSuccess: () => {
      setErrorMsg(null);
      refreshOrders();
    },
    onError: (error) => setErrorMsg(error.message)
  });

  const checkOutMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const payload = await getCoordinatesPayload();
      return api.post(`/service-orders/${orderId}/check-out`, payload);
    },
    onSuccess: () => {
      setErrorMsg(null);
      refreshOrders();
    },
    onError: (error) => setErrorMsg(error.message)
  });

  const pingMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const payload = await getCoordinatesPayload();
      return api.post(`/service-orders/${orderId}/location-ping`, payload);
    },
    onSuccess: () => {
      setErrorMsg(null);
      refreshOrders();
    },
    onError: (error) => setErrorMsg(error.message)
  });

  return (
    <ScrollView className="flex-1 bg-brand-neutralBg px-4 pt-12">
      <Text className="text-2xl font-black text-brand-primary">Ordens de Servico</Text>
      <Text className="mb-4 text-xs text-slate-600">Agenda de campo com check-in/check-out geolocalizado.</Text>

      {(ordersQuery.data ?? []).map((order) => (
        <TouchableOpacity
          className="mb-2 rounded-2xl bg-white p-4"
          key={order.id}
          onPress={() => {
            setErrorMsg(null);
            setSelectedId(order.id);
          }}
        >
          <Text className="text-lg font-black text-brand-primary">{order.code}</Text>
          <Text className="text-sm text-slate-600">{order.title}</Text>
          <Text className="text-xs text-slate-500">
            {order.customer?.name ?? "Sem cliente"} | {STATUS_META[order.status]}
          </Text>
          <Text className="text-xs text-slate-500">
            Programado: {toDateLabel(order.scheduledStartAt ?? order.serviceDate)}
          </Text>
        </TouchableOpacity>
      ))}

      {selectedOrder ? (
        <View className="mb-6 rounded-2xl bg-white p-4">
          <Text className="text-base font-black text-brand-primary">{selectedOrder.code}</Text>
          <Text className="mb-3 text-xs text-slate-600">{selectedOrder.title}</Text>

          <View className="mb-3 flex-row flex-wrap gap-2">
            <TouchableOpacity
              className="rounded-xl bg-brand-primary px-3 py-2"
              onPress={() => checkInMutation.mutate(selectedOrder.id)}
            >
              <Text className="font-bold text-white">{checkInMutation.isPending ? "Check-in..." : "Check-in GPS"}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="rounded-xl border border-brand-primary px-3 py-2"
              onPress={() => pingMutation.mutate(selectedOrder.id)}
            >
              <Text className="font-bold text-brand-primary">{pingMutation.isPending ? "Registrando..." : "Ping GPS"}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="rounded-xl bg-emerald-600 px-3 py-2"
              onPress={() => checkOutMutation.mutate(selectedOrder.id)}
            >
              <Text className="font-bold text-white">{checkOutMutation.isPending ? "Check-out..." : "Check-out GPS"}</Text>
            </TouchableOpacity>
          </View>

          {errorMsg ? <Text className="mb-2 text-xs text-red-600">{errorMsg}</Text> : null}

          <Text className="mb-2 text-sm font-bold text-brand-primary">Ultimos pontos</Text>
          {(traceQuery.data ?? []).slice(-5).map((point) => (
            <View className="mb-2 rounded-xl bg-slate-100 p-2" key={point.id}>
              <Text className="text-xs font-semibold text-brand-primary">{point.type}</Text>
              <Text className="text-xs text-slate-600">
                {point.latitude.toFixed(6)}, {point.longitude.toFixed(6)}
              </Text>
              <Text className="text-xs text-slate-500">{toDateLabel(point.capturedAt)}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}
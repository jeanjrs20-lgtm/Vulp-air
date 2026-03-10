import { useEffect, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import * as Network from "expo-network";
import { authStore } from "@/src/lib/auth";
import { router } from "expo-router";
import { apiBaseUrl } from "@/src/lib/api";

export default function SettingsTab() {
  const [ip, setIp] = useState<string | null>(null);

  useEffect(() => {
    Network.getIpAddressAsync().then(setIp).catch(() => setIp(null));
  }, []);

  return (
    <ScrollView className="flex-1 bg-brand-neutralBg px-4 pt-12">
      <Text className="text-2xl font-black text-brand-primary">Configurações</Text>
      <Text className="mb-3 text-xs text-slate-600">Helper de URL para EXPO_PUBLIC_API_URL</Text>

      <View className="rounded-2xl bg-white p-4">
        <Text className="text-sm font-bold text-brand-primary">API atual</Text>
        <Text className="text-xs text-slate-600">{apiBaseUrl}</Text>

        <Text className="mt-3 text-sm font-bold text-brand-primary">Sugestões de URL</Text>
        <Text className="text-xs text-slate-600">Android emulator: http://10.0.2.2:3001/api/v1</Text>
        <Text className="text-xs text-slate-600">iOS simulator: http://localhost:3001/api/v1</Text>
        <Text className="text-xs text-slate-600">
          Device físico: {ip ? `http://${ip}:3001/api/v1` : "IP LAN não detectado"}
        </Text>
      </View>

      <TouchableOpacity
        className="mt-4 rounded-xl bg-brand-primary p-3"
        onPress={async () => {
          await authStore.logout();
          router.replace("/login");
        }}
      >
        <Text className="text-center font-bold text-white">Sair</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

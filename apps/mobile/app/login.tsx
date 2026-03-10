import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity } from "react-native";
import { router } from "expo-router";
import { BrandLockup } from "@/src/components/brand-lockup";
import { api } from "@/src/lib/api";
import { authStore } from "@/src/lib/auth";

export default function LoginScreen() {
  const [email, setEmail] = useState("tecnico@vulp.local");
  const [password, setPassword] = useState("123456");
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setError(null);
    try {
      const payload = await api.post<any>("/auth/login", { email, password });
      await authStore.setToken(payload.token);
      await authStore.setUser(payload.user);
      router.replace("/(tabs)/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao autenticar");
    }
  };

  return (
    <View className="flex-1 items-center justify-center bg-brand-neutralBg px-5">
      <View className="w-full rounded-3xl bg-white p-5">
        <BrandLockup />
        <Text className="mt-4 text-xs text-slate-500">Entre com seu usuário interno</Text>

        <TextInput
          autoCapitalize="none"
          className="mt-3 rounded-xl border border-slate-300 px-3 py-2"
          onChangeText={setEmail}
          placeholder="email"
          value={email}
        />
        <TextInput
          className="mt-2 rounded-xl border border-slate-300 px-3 py-2"
          onChangeText={setPassword}
          placeholder="senha"
          secureTextEntry
          value={password}
        />

        {error ? <Text className="mt-2 text-sm text-red-600">{error}</Text> : null}

        <TouchableOpacity className="mt-4 rounded-xl bg-brand-primary py-3" onPress={handleLogin}>
          <Text className="text-center font-bold text-white">Entrar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

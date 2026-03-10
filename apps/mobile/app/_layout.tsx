import { Stack } from "expo-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/src/lib/query";
import "../global.css";

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <Stack screenOptions={{ headerShown: false }} />
    </QueryClientProvider>
  );
}

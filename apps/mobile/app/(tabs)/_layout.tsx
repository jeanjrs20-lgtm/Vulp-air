import { Tabs } from "expo-router";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#07384D",
        tabBarInactiveTintColor: "#607d8b",
        tabBarStyle: { backgroundColor: "#ffffff" }
      }}
    >
      <Tabs.Screen name="dashboard" options={{ title: "Dashboard" }} />
      <Tabs.Screen name="service-orders" options={{ title: "OS" }} />
      <Tabs.Screen name="checklists" options={{ title: "Checklists" }} />
      <Tabs.Screen name="pops" options={{ title: "POP/FAQ" }} />
      <Tabs.Screen name="settings" options={{ title: "Config" }} />
    </Tabs>
  );
}

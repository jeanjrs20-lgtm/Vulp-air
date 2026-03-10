import os from "node:os";

const interfaces: Record<string, os.NetworkInterfaceInfo[] | undefined> = os.networkInterfaces();
const candidates: string[] = [];

for (const records of Object.values(interfaces)) {
  for (const entry of records ?? []) {
    if (entry.family === "IPv4" && !entry.internal) {
      candidates.push(entry.address);
    }
  }
}

if (!candidates.length) {
  console.log("Nenhum IP LAN detectado.");
  process.exit(0);
}

const ip = candidates[0];

console.log("Sugestões EXPO_PUBLIC_API_URL:");
console.log("Android emulator: http://10.0.2.2:3001/api/v1");
console.log("iOS simulator:    http://localhost:3001/api/v1");
console.log(`Device físico:    http://${ip}:3001/api/v1`);

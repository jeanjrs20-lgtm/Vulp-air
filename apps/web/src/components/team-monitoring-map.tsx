"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  CircleMarker,
  MapContainer,
  Polyline,
  Popup,
  TileLayer,
  useMap
} from "react-leaflet";
import type { LatLngBoundsExpression, LatLngExpression, Map as LeafletMap } from "leaflet";

type GpsStatus = "HIGH_ACCURACY" | "LOW_ACCURACY" | "OFF" | "UNAVAILABLE" | "MOCKED";
type InternetStatus = "ONLINE" | "OFFLINE" | "LIMITED" | "UNAVAILABLE";
type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export type MonitoringMapTechnician = {
  technician: {
    id: string;
    name: string;
    email: string;
    team?: string | null;
  };
  lastPingAt?: string | null;
  minutesWithoutPing?: number | null;
  gpsStatus: GpsStatus;
  internetStatus: InternetStatus;
  batteryLevel?: number | null;
  isCharging?: boolean | null;
  appVersion?: string | null;
  deviceModel?: string | null;
  osVersion?: string | null;
  location?: {
    latitude: number;
    longitude: number;
    accuracy?: number | null;
  } | null;
  todayCheckIns: number;
  pendingTasks: number;
  completedTasksToday: number;
  lastKnownAddress?: string | null;
  riskLevel: RiskLevel;
};

export type MonitoringMapRoutePoint = {
  id: string;
  latitude: number;
  longitude: number;
  capturedAt: string;
  accuracy?: number | null;
};

const riskColor: Record<RiskLevel, string> = {
  LOW: "#0f766e",
  MEDIUM: "#d97706",
  HIGH: "#dc2626"
};

const gpsLabel: Record<GpsStatus, string> = {
  HIGH_ACCURACY: "Alta precisao",
  LOW_ACCURACY: "Baixa precisao",
  OFF: "GPS desligado",
  UNAVAILABLE: "Indisponivel",
  MOCKED: "GPS simulado"
};

const internetLabel: Record<InternetStatus, string> = {
  ONLINE: "Conectado",
  OFFLINE: "Offline",
  LIMITED: "Limitado",
  UNAVAILABLE: "Indisponivel"
};

const formatDateTime = (value?: string | null) =>
  value ? new Date(value).toLocaleString("pt-BR") : "N/A";

function FitMonitoringBounds({
  technicians,
  routePoints,
  selectedTechnicianId
}: {
  technicians: MonitoringMapTechnician[];
  routePoints: MonitoringMapRoutePoint[];
  selectedTechnicianId?: string;
}) {
  const map = useMap();

  useEffect(() => {
    const selected = technicians.find((item) => item.technician.id === selectedTechnicianId);
    const selectedLocation = selected?.location
      ? ([selected.location.latitude, selected.location.longitude] as LatLngExpression)
      : null;

    const route = routePoints.map(
      (point) => [point.latitude, point.longitude] as LatLngExpression
    );
    const allLocations = technicians
      .filter((item) => item.location)
      .map((item) => [item.location!.latitude, item.location!.longitude] as LatLngExpression);

    const focusPoints: LatLngExpression[] =
      route.length > 1 ? route : selectedLocation ? [selectedLocation] : allLocations;

    if (!focusPoints.length) {
      return;
    }

    if (focusPoints.length === 1) {
      map.setView(focusPoints[0], 13, { animate: true });
      return;
    }

    map.fitBounds(focusPoints as LatLngBoundsExpression, {
      padding: [48, 48]
    });
  }, [map, routePoints, selectedTechnicianId, technicians]);

  return null;
}

export function TeamMonitoringMap({
  technicians,
  routePoints,
  selectedTechnicianId,
  staleMinutes,
  onSelectTechnician
}: {
  technicians: MonitoringMapTechnician[];
  routePoints: MonitoringMapRoutePoint[];
  selectedTechnicianId?: string;
  staleMinutes: number;
  onSelectTechnician: (technicianId: string) => void;
}) {
  const mapRef = useRef<LeafletMap | null>(null);

  useEffect(
    () => () => {
      mapRef.current?.remove();
      mapRef.current = null;
    },
    []
  );

  const defaultCenter: LatLngExpression = useMemo(() => {
    const first = technicians.find((item) => item.location);
    if (!first?.location) {
      return [-23.55052, -46.633308] as LatLngExpression;
    }
    return [first.location.latitude, first.location.longitude] as LatLngExpression;
  }, [technicians]);

  const routePath = routePoints.map(
    (point) => [point.latitude, point.longitude] as LatLngExpression
  );

  return (
    <MapContainer
      center={defaultCenter}
      className="h-[620px] w-full rounded-2xl"
      ref={mapRef}
      scrollWheelZoom
      zoom={11}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {routePath.length > 1 ? (
        <Polyline
          pathOptions={{
            color: "#1d4ed8",
            opacity: 0.9,
            weight: 4
          }}
          positions={routePath}
        />
      ) : null}

      {technicians
        .filter((item) => item.location)
        .map((item) => {
          const location = item.location!;
          const stale =
            item.minutesWithoutPing != null && item.minutesWithoutPing > staleMinutes;
          const selected = item.technician.id === selectedTechnicianId;
          const markerColor = stale ? "#6b7280" : riskColor[item.riskLevel];
          const statusText = stale ? "Offline" : "Online";

          return (
            <CircleMarker
              center={[location.latitude, location.longitude]}
              eventHandlers={{
                click: () => onSelectTechnician(item.technician.id)
              }}
              key={item.technician.id}
              pathOptions={{
                color: selected ? "#052a39" : markerColor,
                fillColor: markerColor,
                fillOpacity: selected ? 1 : 0.85,
                weight: selected ? 3 : 2
              }}
              radius={selected ? 10 : 8}
            >
              <Popup minWidth={330}>
                <div className="space-y-2 text-sm">
                  <p className="text-base font-semibold text-slate-800">{item.technician.name}</p>
                  <div className="flex items-center gap-2 text-sm">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        stale ? "bg-rose-500" : "bg-emerald-500"
                      }`}
                    />
                    <span>{statusText}</span>
                  </div>
                  <p>
                    <strong>Endereco:</strong> {item.lastKnownAddress ?? "Sem endereco vinculado"}
                  </p>
                  <p>
                    <strong>Atualizado:</strong> {formatDateTime(item.lastPingAt)}
                  </p>
                  <p>
                    <strong>Precisao:</strong>{" "}
                    {location.accuracy != null ? `${location.accuracy.toFixed(1)} m` : "N/A"}
                  </p>
                  <p>
                    <strong>Bateria:</strong>{" "}
                    {item.batteryLevel != null
                      ? `${item.batteryLevel}%${item.isCharging ? " (carregando)" : ""}`
                      : "N/A"}
                  </p>
                  <p>
                    <strong>Status GPS:</strong> {gpsLabel[item.gpsStatus]}
                  </p>
                  <p>
                    <strong>Internet:</strong> {internetLabel[item.internetStatus]}
                  </p>
                  <p>
                    <strong>Dispositivo:</strong> {item.deviceModel ?? "N/A"}
                  </p>
                  <p>
                    <strong>Versao App:</strong> {item.appVersion ?? "N/A"}
                  </p>
                  <p>
                    <strong>Check-ins hoje:</strong> {item.todayCheckIns}
                  </p>
                  <p>
                    <strong>Tarefas em espera:</strong> {item.pendingTasks}
                  </p>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}

      <FitMonitoringBounds
        routePoints={routePoints}
        selectedTechnicianId={selectedTechnicianId}
        technicians={technicians}
      />
    </MapContainer>
  );
}

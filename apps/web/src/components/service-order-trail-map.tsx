"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Circle,
  CircleMarker,
  MapContainer,
  Polyline,
  Popup,
  TileLayer,
  useMap
} from "react-leaflet";
import type { LatLngBoundsExpression, LatLngExpression } from "leaflet";

type TrailPoint = {
  id: string;
  type: "CHECK_IN" | "CHECK_OUT" | "PING";
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  source?: string | null;
  capturedAt: string;
};

type SiteGeofence = {
  name?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  geofenceRadiusMeters?: number | null;
};

const pointMeta: Record<TrailPoint["type"], { color: string; label: string }> = {
  CHECK_IN: { color: "#16a34a", label: "Check-in" },
  CHECK_OUT: { color: "#dc2626", label: "Check-out" },
  PING: { color: "#2563eb", label: "Ping" }
};

const formatDateTime = (value: string) => new Date(value).toLocaleString("pt-BR");

function FitToTrail({
  positions,
  geofenceCenter
}: {
  positions: LatLngExpression[];
  geofenceCenter: LatLngExpression | null;
}) {
  const map = useMap();

  useEffect(() => {
    const bounds = [...positions];
    if (geofenceCenter) {
      bounds.push(geofenceCenter);
    }

    if (bounds.length === 0) {
      return;
    }

    if (bounds.length === 1) {
      map.setView(bounds[0], 16, { animate: true });
      return;
    }

    map.fitBounds(bounds as LatLngBoundsExpression, {
      padding: [28, 28]
    });
  }, [geofenceCenter, map, positions]);

  return null;
}

export function ServiceOrderTrailMap({
  points,
  siteGeofence
}: {
  points: TrailPoint[];
  siteGeofence?: SiteGeofence | null;
}) {
  const [canRenderMap, setCanRenderMap] = useState(false);

  useEffect(() => {
    setCanRenderMap(true);
  }, []);

  const positions = useMemo<LatLngExpression[]>(
    () => points.map((point) => [point.latitude, point.longitude]),
    [points]
  );

  const geofenceCenter =
    siteGeofence?.latitude != null && siteGeofence?.longitude != null
      ? ([siteGeofence.latitude, siteGeofence.longitude] as LatLngExpression)
      : null;

  const center: LatLngExpression =
    positions[0] ?? geofenceCenter ?? ([-23.55052, -46.633308] as LatLngExpression);

  if (!canRenderMap) {
    return <div className="h-[320px] w-full rounded-xl bg-slate-100" />;
  }

  return (
    <MapContainer
      center={center}
      className="h-[320px] w-full rounded-xl"
      scrollWheelZoom
      zoom={13}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {positions.length > 1 ? (
        <Polyline
          pathOptions={{
            color: "#07384D",
            opacity: 0.85,
            weight: 4
          }}
          positions={positions}
        />
      ) : null}

      {geofenceCenter ? (
        <Circle
          center={geofenceCenter}
          pathOptions={{ color: "#9333ea", fillOpacity: 0.08, weight: 2 }}
          radius={siteGeofence?.geofenceRadiusMeters ?? 200}
        >
          <Popup>
            <p className="font-semibold">{siteGeofence?.name ?? "Unidade"}</p>
            <p>Raio geofence: {(siteGeofence?.geofenceRadiusMeters ?? 200).toFixed(0)} m</p>
          </Popup>
        </Circle>
      ) : null}

      {points.map((point) => (
        <CircleMarker
          center={[point.latitude, point.longitude]}
          key={point.id}
          pathOptions={{
            color: pointMeta[point.type].color,
            fillColor: pointMeta[point.type].color,
            fillOpacity: 0.9
          }}
          radius={6}
        >
          <Popup>
            <p className="font-semibold">{pointMeta[point.type].label}</p>
            <p>{point.latitude.toFixed(6)}, {point.longitude.toFixed(6)}</p>
            <p>Acuracia: {point.accuracy != null ? `${point.accuracy.toFixed(1)}m` : "-"}</p>
            <p>Fonte: {point.source ?? "N/A"}</p>
            <p>{formatDateTime(point.capturedAt)}</p>
          </Popup>
        </CircleMarker>
      ))}

      <FitToTrail geofenceCenter={geofenceCenter} positions={positions} />
    </MapContainer>
  );
}

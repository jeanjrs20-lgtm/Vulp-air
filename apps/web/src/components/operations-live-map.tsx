"use client";

import { useEffect, useState } from "react";
import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  Tooltip,
  useMap
} from "react-leaflet";
import type { LatLngBoundsExpression, LatLngTuple } from "leaflet";

type MapPinType = "live" | "agenda";

export type OperationsMapPin = {
  id: string;
  latitude: number;
  longitude: number;
  title: string;
  subtitle?: string;
  meta?: string;
  type: MapPinType;
};

const pinStyle: Record<MapPinType, { color: string; radius: number }> = {
  live: {
    color: "#0ea5e9",
    radius: 8
  },
  agenda: {
    color: "#f59e0b",
    radius: 6
  }
};

function FitPins({ pins }: { pins: OperationsMapPin[] }) {
  const map = useMap();

  useEffect(() => {
    if (!pins.length) {
      return;
    }

    const bounds: LatLngTuple[] = pins.map((pin) => [pin.latitude, pin.longitude]);

    if (bounds.length === 1) {
      map.setView(bounds[0], 13, { animate: true });
      return;
    }

    map.fitBounds(bounds as LatLngBoundsExpression, {
      padding: [32, 32]
    });
  }, [map, pins]);

  return null;
}

export function OperationsLiveMap({ pins }: { pins: OperationsMapPin[] }) {
  const [canRenderMap, setCanRenderMap] = useState(false);

  useEffect(() => {
    setCanRenderMap(true);
  }, []);

  const center: LatLngTuple = pins.length
    ? [pins[0].latitude, pins[0].longitude]
    : [-23.55052, -46.633308];

  if (!canRenderMap) {
    return <div className="h-[420px] w-full bg-slate-100" />;
  }

  return (
    <MapContainer center={center} className="h-[420px] w-full" scrollWheelZoom zoom={11}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {pins.map((pin) => (
        <CircleMarker
          center={[pin.latitude, pin.longitude]}
          key={pin.id}
          pathOptions={{
            color: pinStyle[pin.type].color,
            fillColor: pinStyle[pin.type].color,
            fillOpacity: 0.85,
            weight: 2
          }}
          radius={pinStyle[pin.type].radius}
        >
          <Tooltip direction="top" opacity={0.95}>
            {pin.title}
          </Tooltip>
          <Popup>
            <div className="space-y-1 text-sm">
              <p className="font-semibold text-slate-800">{pin.title}</p>
              {pin.subtitle ? <p className="text-slate-700">{pin.subtitle}</p> : null}
              {pin.meta ? <p className="text-xs text-slate-500">{pin.meta}</p> : null}
              <p className="text-xs text-slate-500">
                {pin.latitude.toFixed(6)}, {pin.longitude.toFixed(6)}
              </p>
            </div>
          </Popup>
        </CircleMarker>
      ))}

      <FitPins pins={pins} />
    </MapContainer>
  );
}

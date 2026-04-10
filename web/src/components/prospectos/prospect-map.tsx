"use client";

import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";

export type ProspectMapPoint = {
  id: number;
  lat: number;
  lng: number;
  empresa: string;
  zona?: string | null;
  potencial_usd?: number | null;
  score_ia?: number | null;
  estado?: string | null;
};

type Props = {
  points: ProspectMapPoint[];
};

function ProspectMap({ points }: Props) {
  const valid = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  const center: [number, number] =
    valid.length > 0
      ? [valid.reduce((s, p) => s + p.lat, 0) / valid.length, valid.reduce((s, p) => s + p.lng, 0) / valid.length]
      : [25.7, -100.3];

  return (
    <MapContainer
      center={center}
      zoom={valid.length > 4 ? 6 : 7}
      className="h-[min(52vh,440px)] w-full rounded-xl border border-border/50 z-0"
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {valid.map((p) => (
        <CircleMarker
          key={p.id}
          center={[p.lat, p.lng]}
          radius={10 + Math.min(8, (p.score_ia || 50) / 12)}
          pathOptions={{
            color: "#34d399",
            fillColor: "#10b981",
            fillOpacity: 0.55,
            weight: 2,
          }}
        >
          <Tooltip direction="top" opacity={0.95}>
            {p.empresa}
          </Tooltip>
          <Popup>
            <div className="text-xs space-y-1 min-w-[200px]">
              <p className="font-semibold">{p.empresa}</p>
              <p className="text-muted-foreground">{p.zona || "—"}</p>
              <p>
                Potencial: USD {(p.potencial_usd || 0).toLocaleString("es-MX")}
              </p>
              <p>Score: {Math.round(p.score_ia || 0)} · {p.estado || "—"}</p>
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}

export default ProspectMap;

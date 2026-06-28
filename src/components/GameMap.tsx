"use client";

import { useEffect, useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  Marker as LeafletMarker,
  Tooltip,
  useMap,
} from "react-leaflet";
import L, { type LatLngBoundsExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Marker } from "@/lib/puzzle";
import { formatYear } from "@/lib/puzzle";

/**
 * Builds a Leaflet divIcon: a year badge sitting ABOVE a teardrop pin. The pin
 * carries a bold letter ("B" born / "D" died) so the two markers are
 * distinguishable WITHOUT relying on color (colorblind-safe). The pin tip
 * (bottom-center) is anchored to the coordinate.
 */
function makePinIcon(year: number, color: string, letter: string): L.DivIcon {
  const html = `
    <div style="display:flex;flex-direction:column;align-items:center;">
      <span style="
        background:${color};
        color:#fff;
        font-weight:700;
        font-size:13px;
        line-height:1;
        padding:4px 7px;
        border-radius:6px;
        box-shadow:0 1px 3px rgba(0,0,0,0.4);
        white-space:nowrap;
        margin-bottom:2px;
      ">${formatYear(year)}</span>
      <svg width="26" height="34" viewBox="0 0 26 34" xmlns="http://www.w3.org/2000/svg">
        <path d="M13 0C5.82 0 0 5.82 0 13c0 9.25 13 21 13 21s13-11.75 13-21C26 5.82 20.18 0 13 0z"
          fill="${color}" stroke="#fff" stroke-width="2"/>
        <circle cx="13" cy="13" r="6.5" fill="#fff"/>
        <text x="13" y="13" text-anchor="middle" dominant-baseline="central"
          font-family="system-ui, sans-serif" font-size="9" font-weight="700"
          fill="${color}">${letter}</text>
      </svg>
    </div>
  `;
  const width = 60;
  const badgeHeight = 21;
  const pinHeight = 34;
  const totalHeight = badgeHeight + 2 + pinHeight;
  return L.divIcon({
    html,
    className: "", // strip default Leaflet styling
    iconSize: [width, totalHeight],
    iconAnchor: [width / 2, totalHeight], // pin tip points at the coordinate
  });
}

/** Imperatively fit the map to show both markers whenever they change. */
function FitBounds({ bounds }: { bounds: LatLngBoundsExpression }) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(bounds, { padding: [60, 60] });
  }, [map, bounds]);
  return null;
}

export default function GameMap({
  birth,
  death,
  showLabels = false,
  colorblind = false,
}: {
  birth: Marker;
  death: Marker;
  showLabels?: boolean;
  colorblind?: boolean;
}) {
  // Green/red by default; blue/orange is a colorblind-safer pair. The B/D pin
  // glyphs make the markers distinguishable regardless of palette.
  const bornColor = colorblind ? "#2563eb" : "#16a34a";
  const diedColor = colorblind ? "#ea580c" : "#dc2626";
  const birthIcon = useMemo(
    () => makePinIcon(birth.year, bornColor, "B"),
    [birth.year, bornColor],
  );
  const deathIcon = useMemo(
    () => makePinIcon(death.year, diedColor, "D"),
    [death.year, diedColor],
  );

  const bounds: LatLngBoundsExpression = useMemo(
    () => [
      [birth.lat, birth.lng],
      [death.lat, death.lng],
    ],
    [birth.lat, birth.lng, death.lat, death.lng],
  );

  return (
    <MapContainer
      bounds={bounds}
      scrollWheelZoom
      className="h-full w-full"
      style={{ background: "#aadaff" }}
    >
      {/* Base map WITHOUT labels — geography is part of the puzzle. */}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png"
        subdomains="abcd"
      />
      {/* Labels-only overlay, revealed by the first hint. */}
      {showLabels && (
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png"
          subdomains="abcd"
        />
      )}
      <FitBounds bounds={bounds} />
      <LeafletMarker position={[birth.lat, birth.lng]} icon={birthIcon}>
        <Tooltip>Born {formatYear(birth.year)} &middot; {birth.place}</Tooltip>
      </LeafletMarker>
      <LeafletMarker position={[death.lat, death.lng]} icon={deathIcon}>
        <Tooltip>Died {formatYear(death.year)} &middot; {death.place}</Tooltip>
      </LeafletMarker>
    </MapContainer>
  );
}

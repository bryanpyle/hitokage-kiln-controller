import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid2";
import Skeleton from "@mui/material/Skeleton";
import Typography from "@mui/material/Typography";
import ControlPanel from "../components/ControlPanel";
import FiringChart from "../components/FiringChart";
import PidStatsTable from "../components/PidStatsTable";
import ZoneCard from "../components/ZoneCard";
import { fetchConfig, fetchProfiles } from "../api/http";
import {
  useAllZonesWebSocket,
  buildMultiZoneChartData,
  profileToSchedulePoints,
} from "../api/useOvenWebSocket";
import type { FiringProfile, KilnConfig, OvenState } from "../types";

export default function DashboardPage() {
  const [config, setConfig] = useState<KilnConfig | null>(null);
  const [profiles, setProfiles] = useState<FiringProfile[]>([]);

  useEffect(() => {
    fetchConfig().then(setConfig).catch(console.error);
    fetchProfiles().then(setProfiles).catch(console.error);
  }, []);

  // Derive zone IDs from config (empty until loaded)
  const zoneIds = config?.zones.map((z) => z.id) ?? [];

  // Single hook manages all zone WebSocket connections
  const zoneData = useAllZonesWebSocket(zoneIds);

  if (!config) {
    return (
      <Box>
        <Skeleton height={80} sx={{ mb: 2, borderRadius: 2 }} />
        <Skeleton variant="rectangular" height={200} sx={{ mb: 2, borderRadius: 2 }} />
        <Skeleton variant="rectangular" height={400} sx={{ borderRadius: 2 }} />
      </Box>
    );
  }

  // Representative state for control panel button logic (first non-IDLE zone wins)
  const anyZoneState: OvenState | null =
    zoneIds
      .map((id) => zoneData[id]?.state)
      .find((s): s is OvenState => !!s && s.state !== "IDLE") ??
    zoneData[zoneIds[0]]?.state ??
    null;

  // Aggregated chart data across all zones
  const { chartData, scheduleData: wsScheduleData } = buildMultiZoneChartData(zoneData, zoneIds);

  // If the WS backlog hasn't delivered the active profile yet (e.g. run was
  // started from the UI without a page reload), fall back to the HTTP-fetched
  // profiles list using the profile name already present in OvenState.
  const runningProfileName = anyZoneState?.profile ?? null;
  const scheduleData = wsScheduleData.length > 0
    ? wsScheduleData
    : (() => {
        if (!runningProfileName) return [];
        const found = profiles.find((p) => p.name === runningProfileName);
        return found ? profileToSchedulePoints(found) : [];
      })();

  // Per-zone PID stats for the combined table
  const pidZones = config.zones.map((z) => ({
    zoneName: z.name,
    stats: zoneData[z.id]?.state?.pidstats ?? null,
  }));

  // All live zone states for aggregate cost calculation
  const allZoneStates = zoneIds
    .map((id) => zoneData[id]?.state)
    .filter((s): s is OvenState => s !== null && s !== undefined);

  const anyDisconnected = zoneIds.some((id) => !zoneData[id]?.connected);

  return (
    <Box display="flex" flexDirection="column" gap={2}>
      {/* ── Connection warning ── */}
      {anyDisconnected && (
        <Typography variant="caption" color="warning.main">
          ⚠ Reconnecting to one or more zones…
        </Typography>
      )}

      {/* ── 1. Control panel (full width, top) ── */}
      <ControlPanel
        zoneIds={zoneIds}
        anyZoneState={anyZoneState}
        allZoneStates={allZoneStates}
        profiles={profiles}
      />

      {/* ── 2. Zone status cards (side by side) ── */}
      <Grid container spacing={2}>
        {config.zones.map((zone) => {
          const zd = zoneData[zone.id];
          return (
            <Grid key={zone.id} size={{ xs: 12, sm: 6, lg: 4 }}>
              {zd?.state ? (
                <ZoneCard state={zd.state} tempScale={config.temp_scale} />
              ) : (
                <Skeleton variant="rectangular" height={240} sx={{ borderRadius: 2 }} />
              )}
            </Grid>
          );
        })}
      </Grid>

      {/* ── 3. Unified firing chart (all zones) ── */}
      <FiringChart
        chartData={chartData}
        scheduleData={scheduleData}
        zones={config.zones}
        tempScale={config.temp_scale}
      />

      {/* ── 4. Combined PID stats table ── */}
      <PidStatsTable zones={pidZones} />
    </Box>
  );
}

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
import { useOvenWebSocket } from "../api/useOvenWebSocket";
import type { FiringProfile, KilnConfig } from "../types";

/** Single zone panel: status card + chart + control */
function ZonePanel({
  zoneId,
  profiles,
  config,
}: {
  zoneId: number;
  profiles: FiringProfile[];
  config: KilnConfig;
}) {
  const { state, chartData, scheduleData, connected } =
    useOvenWebSocket(zoneId);

  return (
    <Box>
      {/* Connection indicator */}
      {!connected && (
        <Typography variant="caption" color="warning.main" sx={{ mb: 1, display: "block" }}>
          ⚠ Connecting to zone {zoneId}…
        </Typography>
      )}

      <Grid container spacing={2}>
        {/* Zone status card */}
        <Grid size={{ xs: 12, md: 4 }}>
          {state ? (
            <ZoneCard state={state} tempScale={config.temp_scale} />
          ) : (
            <Skeleton variant="rectangular" height={220} sx={{ borderRadius: 2 }} />
          )}
        </Grid>

        {/* Control panel */}
        <Grid size={{ xs: 12, md: 8 }}>
          <ControlPanel
            zone={zoneId}
            ovenState={state}
            profiles={profiles}
          />
        </Grid>

        {/* Firing chart — full width */}
        <Grid size={12}>
          <FiringChart
            chartData={chartData}
            scheduleData={scheduleData}
            tempScale={config.temp_scale}
          />
        </Grid>

        {/* PID stats */}
        {state?.pidstats && Object.keys(state.pidstats).length > 0 && (
          <Grid size={{ xs: 12, md: 5 }}>
            <PidStatsTable stats={state.pidstats} />
          </Grid>
        )}
      </Grid>
    </Box>
  );
}

export default function DashboardPage() {
  const [config, setConfig] = useState<KilnConfig | null>(null);
  const [profiles, setProfiles] = useState<FiringProfile[]>([]);

  useEffect(() => {
    fetchConfig().then(setConfig).catch(console.error);
    fetchProfiles().then(setProfiles).catch(console.error);
  }, []);

  if (!config) {
    return (
      <Box>
        <Skeleton height={60} sx={{ mb: 2 }} />
        <Skeleton variant="rectangular" height={300} />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Dashboard
      </Typography>

      <Box display="flex" flexDirection="column" gap={4}>
        {config.zones.map((zone) => (
          <Box key={zone.id}>
            {config.zones.length > 1 && (
              <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                {zone.name}
              </Typography>
            )}
            <ZonePanel
              zoneId={zone.id}
              profiles={profiles}
              config={config}
            />
          </Box>
        ))}
      </Box>
    </Box>
  );
}

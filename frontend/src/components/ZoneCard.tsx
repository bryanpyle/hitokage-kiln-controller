import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import LinearProgress from "@mui/material/LinearProgress";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import type { OvenState } from "../types";

interface ZoneCardProps {
  state: OvenState;
  tempScale: "c" | "f";
}

const STATE_COLORS: Record<string, "default" | "success" | "warning" | "error"> = {
  IDLE: "default",
  RUNNING: "success",
  PAUSED: "warning",
};

function formatTemp(temp: number, scale: "c" | "f"): string {
  return `${Math.round(temp)} °${scale.toUpperCase()}`;
}

function formatRuntime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatCost(cost: number, currency: string): string {
  return `${currency}${cost.toFixed(3)}`;
}

export default function ZoneCard({ state, tempScale }: ZoneCardProps) {
  const progress =
    state.totaltime > 0
      ? Math.min(100, (state.runtime / state.totaltime) * 100)
      : 0;

  const isHeating = state.heat > 0;

  return (
    <Card
      variant="outlined"
      sx={{
        borderColor: isHeating
          ? "warning.main"
          : state.state === "RUNNING"
          ? "success.main"
          : "divider",
        transition: "border-color 0.4s",
        height: "100%",
      }}
    >
      <CardContent>
        {/* Header row */}
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
          <Typography variant="h6">{state.zone_name}</Typography>
          <Box display="flex" gap={1} alignItems="center">
            {isHeating && (
              <Tooltip title={`Heat on: ${(state.heat * 100).toFixed(0)}%`}>
                <Chip label="🔥 Heating" size="small" color="warning" />
              </Tooltip>
            )}
            <Chip
              label={state.state}
              size="small"
              color={STATE_COLORS[state.state] ?? "default"}
            />
          </Box>
        </Box>

        {/* Temperature block */}
        <Box display="flex" gap={4} mb={2}>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Actual
            </Typography>
            <Typography variant="h4" color="error.light" fontWeight={700}>
              {formatTemp(state.temperature, tempScale)}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Target
            </Typography>
            <Typography variant="h4" color="warning.light" fontWeight={700}>
              {state.state !== "IDLE"
                ? formatTemp(state.target, tempScale)
                : "—"}
            </Typography>
          </Box>
        </Box>

        {/* Profile progress */}
        {state.state !== "IDLE" && state.profile && (
          <>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Profile: <strong>{state.profile}</strong>
            </Typography>
            <Box display="flex" alignItems="center" gap={1} mb={1}>
              <LinearProgress
                variant="determinate"
                value={progress}
                sx={{ flex: 1, height: 8, borderRadius: 4 }}
                color={state.catching_up ? "warning" : "success"}
              />
              <Typography variant="caption" sx={{ minWidth: 36 }}>
                {progress.toFixed(0)}%
              </Typography>
            </Box>
            <Box display="flex" justifyContent="space-between">
              <Typography variant="caption" color="text.secondary">
                {formatRuntime(state.runtime)} elapsed
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {formatRuntime(state.totaltime - state.runtime)} remaining
              </Typography>
            </Box>
          </>
        )}

        {state.catching_up && (
          <Typography variant="caption" color="warning.main">
            ⚠ Catching up…
          </Typography>
        )}

        <Divider sx={{ my: 1.5 }} />

        {/* Stats row */}
        <Box display="flex" gap={3} flexWrap="wrap">
          <Box>
            <Typography variant="caption" color="text.secondary" display="block">
              Heat Rate
            </Typography>
            <Typography variant="body2">
              {state.heat_rate.toFixed(0)} °/h
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary" display="block">
              Run Cost
            </Typography>
            <Typography variant="body2">
              {formatCost(state.cost, state.currency_type)}
            </Typography>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

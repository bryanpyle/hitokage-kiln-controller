import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
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

export default function ZoneCard({ state, tempScale }: ZoneCardProps) {
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
              {state.state !== "IDLE" ? formatTemp(state.target, tempScale) : "—"}
            </Typography>
          </Box>
        </Box>

        {state.catching_up && (
          <Typography variant="caption" color="warning.main" display="block" mb={1}>
            ⚠ Catching up…
          </Typography>
        )}

        <Divider sx={{ my: 1 }} />

        {/* Heat rate — zone-specific, kept here */}
        <Box mt={1}>
          <Typography variant="caption" color="text.secondary" display="block">
            Heat Rate
          </Typography>
          <Typography variant="body2">
            {state.heat_rate.toFixed(0)} °/h
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
}

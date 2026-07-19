import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { sendRelay } from "../api/http";
import type { OvenState } from "../types";

interface ZoneCardProps {
  state: OvenState;
  tempScale: "c" | "f";
  heatOnSeconds: number;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const STATE_COLORS: Record<string, "default" | "success" | "warning" | "error"> = {
  IDLE: "default",
  RUNNING: "success",
  PAUSED: "warning",
};

function formatTemp(temp: number, scale: "c" | "f"): string {
  return `${Math.round(temp)} °${scale.toUpperCase()}`;
}

export default function ZoneCard({ state, tempScale, heatOnSeconds }: ZoneCardProps) {
  const [relayBusy, setRelayBusy] = useState(false);
  const [relayError, setRelayError] = useState("");

  const isHeating = state.heat > 0;
  const isIdle = state.state === "IDLE";

  async function toggleRelay(on: boolean) {
    setRelayError("");
    setRelayBusy(true);
    try {
      await sendRelay({ zone: state.zone, on });
    } catch (e) {
      setRelayError(String(e));
    } finally {
      setRelayBusy(false);
    }
  }

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

        {/* Heat rate + heat-on timer */}
        <Box mt={1} display="flex" gap={4}>
          <Box>
            <Typography variant="caption" color="text.secondary" display="block">
              Heat Rate
            </Typography>
            <Typography variant="body2">
              {state.heat_rate.toFixed(0)} °/h
            </Typography>
          </Box>
          {state.state !== "IDLE" && (
            <Tooltip title="Total time the heating element has been ON this firing">
              <Box>
                <Typography variant="caption" color="text.secondary" display="block">
                  Heat On Time
                </Typography>
                <Typography variant="body2" color={heatOnSeconds > 0 ? "warning.light" : "text.primary"}>
                  {formatDuration(heatOnSeconds)}
                </Typography>
              </Box>
            </Tooltip>
          )}
        </Box>

        {/* Manual relay toggle — only available when IDLE */}
        {isIdle && (
          <>
            <Divider sx={{ my: 1 }} />
            <Box display="flex" alignItems="center" gap={1} mt={1}>
              <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
                Relay:
              </Typography>
              <Button
                size="small"
                variant={isHeating ? "contained" : "outlined"}
                color="warning"
                disabled={relayBusy || isHeating}
                onClick={() => toggleRelay(true)}
              >
                ON
              </Button>
              <Button
                size="small"
                variant={!isHeating ? "contained" : "outlined"}
                color="inherit"
                disabled={relayBusy || !isHeating}
                onClick={() => toggleRelay(false)}
              >
                OFF
              </Button>
            </Box>
            {relayError && (
              <Typography variant="caption" color="error" display="block" mt={0.5}>
                {relayError}
              </Typography>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

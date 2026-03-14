import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import LinearProgress from "@mui/material/LinearProgress";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Select from "@mui/material/Select";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import StopIcon from "@mui/icons-material/Stop";
import { sendControl } from "../api/http";
import type { FiringProfile, OvenState } from "../types";

interface ControlPanelProps {
  /** All zone IDs — the same command is broadcast to every zone. */
  zoneIds: number[];
  /** Representative oven state (used to derive button enable/disable + profile info). */
  anyZoneState: OvenState | null;
  /** All zone states — used to compute aggregate run cost. */
  allZoneStates: OvenState[];
  profiles: FiringProfile[];
}

function formatRuntime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function ControlPanel({
  zoneIds,
  anyZoneState,
  allZoneStates,
  profiles,
}: ControlPanelProps) {
  const [selectedProfile, setSelectedProfile] = useState("");
  const [startat, setStartat] = useState("0");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const kilnState = anyZoneState?.state ?? "IDLE";
  const isRunning = kilnState === "RUNNING";
  const isPaused = kilnState === "PAUSED";
  const isIdle = kilnState === "IDLE";

  // Progress + timing from the representative zone (same profile across all zones)
  const runtime = anyZoneState?.runtime ?? 0;
  const totaltime = anyZoneState?.totaltime ?? 0;
  const progress = totaltime > 0 ? Math.min(100, (runtime / totaltime) * 100) : 0;
  const profileName = anyZoneState?.profile ?? null;
  const catchingUp = anyZoneState?.catching_up ?? false;

  // Aggregate run cost across all zones
  const totalCost = allZoneStates.reduce((sum, s) => sum + (s?.cost ?? 0), 0);
  const currencyType = anyZoneState?.currency_type ?? "$";

  async function dispatch(cmd: "run" | "stop" | "pause" | "resume") {
    setError("");
    setBusy(true);
    try {
      await Promise.all(
        zoneIds.map((zone) =>
          sendControl({
            cmd,
            zone,
            profile: cmd === "run" ? selectedProfile : undefined,
            startat: cmd === "run" ? parseInt(startat, 10) || 0 : undefined,
          })
        )
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Paper sx={{ p: 2 }}>
      {/* ── Top row: controls ── */}
      <Box display="flex" gap={2} flexWrap="wrap" alignItems="center">
        <FormControl size="small" sx={{ minWidth: 240, flex: 1 }}>
          <InputLabel id="profile-label-all">Firing Profile</InputLabel>
          <Select
            labelId="profile-label-all"
            value={selectedProfile}
            label="Firing Profile"
            onChange={(e) => setSelectedProfile(e.target.value)}
            disabled={!isIdle || busy}
          >
            {profiles.map((p) => (
              <MenuItem key={p.name} value={p.name}>
                {p.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <TextField
          label="Start at (min)"
          size="small"
          type="number"
          value={startat}
          onChange={(e) => setStartat(e.target.value)}
          disabled={!isIdle || busy}
          inputProps={{ min: 0, step: 1 }}
          sx={{ width: 130 }}
        />

        <Box display="flex" gap={1} flexWrap="wrap">
          <Button
            variant="contained"
            color="success"
            startIcon={<PlayArrowIcon />}
            disabled={!isIdle || !selectedProfile || busy}
            onClick={() => dispatch("run")}
          >
            Run
          </Button>
          <Button
            variant="outlined"
            startIcon={<PauseIcon />}
            disabled={!isRunning || busy}
            onClick={() => dispatch("pause")}
          >
            Pause
          </Button>
          <Button
            variant="outlined"
            color="success"
            startIcon={<PlayArrowIcon />}
            disabled={!isPaused || busy}
            onClick={() => dispatch("resume")}
          >
            Resume
          </Button>
          <Button
            variant="contained"
            color="error"
            startIcon={<StopIcon />}
            disabled={isIdle || busy}
            onClick={() => dispatch("stop")}
          >
            Stop
          </Button>
        </Box>
      </Box>

      {error && (
        <Typography color="error" variant="caption" sx={{ mt: 0.5, display: "block" }}>
          {error}
        </Typography>
      )}

      {/* ── Profile run status (hidden when IDLE) ── */}
      {!isIdle && profileName && (
        <>
          <Divider sx={{ my: 1.5 }} />
          <Box display="flex" alignItems="center" gap={2} flexWrap="wrap">
            {/* Profile name + progress */}
            <Box flex={1} minWidth={200}>
              <Box display="flex" justifyContent="space-between" mb={0.5}>
                <Typography variant="body2" color="text.secondary">
                  {profileName}
                  {catchingUp && (
                    <Typography component="span" variant="caption" color="warning.main" sx={{ ml: 1 }}>
                      ⚠ catching up
                    </Typography>
                  )}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {progress.toFixed(0)}%
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={progress}
                sx={{ height: 8, borderRadius: 4 }}
                color={catchingUp ? "warning" : "success"}
              />
              <Box display="flex" justifyContent="space-between" mt={0.5}>
                <Typography variant="caption" color="text.secondary">
                  {formatRuntime(runtime)} elapsed
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {formatRuntime(totaltime - runtime)} remaining
                </Typography>
              </Box>
            </Box>

            {/* Aggregate cost */}
            <Box textAlign="right" sx={{ whiteSpace: "nowrap" }}>
              <Typography variant="caption" color="text.secondary" display="block">
                Total Run Cost
              </Typography>
              <Typography variant="h6" fontWeight={700} color="text.primary">
                {currencyType}{totalCost.toFixed(3)}
              </Typography>
            </Box>
          </Box>
        </>
      )}
    </Paper>
  );
}

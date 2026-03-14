import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
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
  zone: number;
  ovenState: OvenState | null;
  profiles: FiringProfile[];
  onRefresh?: () => void;
}

export default function ControlPanel({
  zone,
  ovenState,
  profiles,
  onRefresh,
}: ControlPanelProps) {
  const [selectedProfile, setSelectedProfile] = useState("");
  const [startat, setStartat] = useState("0");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const kilnState = ovenState?.state ?? "IDLE";
  const isRunning = kilnState === "RUNNING";
  const isPaused = kilnState === "PAUSED";
  const isIdle = kilnState === "IDLE";

  async function dispatch(cmd: "run" | "stop" | "pause" | "resume") {
    setError("");
    setBusy(true);
    try {
      await sendControl({
        cmd,
        zone,
        profile: cmd === "run" ? selectedProfile : undefined,
        startat: cmd === "run" ? parseInt(startat, 10) || 0 : undefined,
      });
      onRefresh?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Control
      </Typography>

      {/* Profile selector */}
      <Box display="flex" gap={2} flexWrap="wrap" mb={2}>
        <FormControl size="small" sx={{ minWidth: 220, flex: 1 }}>
          <InputLabel id={`profile-label-z${zone}`}>Profile</InputLabel>
          <Select
            labelId={`profile-label-z${zone}`}
            value={selectedProfile}
            label="Profile"
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
      </Box>

      {/* Action buttons */}
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

      {error && (
        <Typography color="error" variant="caption" sx={{ mt: 1, display: "block" }}>
          {error}
        </Typography>
      )}
    </Paper>
  );
}

import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import type { FiringProfile, ProfilePoint } from "../types";

interface ProfileEditorProps {
  open: boolean;
  initial?: FiringProfile | null;
  tempScale: "c" | "f";
  onSave: (profile: FiringProfile) => void;
  onClose: () => void;
}

const BLANK_PROFILE: FiringProfile = {
  name: "",
  type: "profile",
  data: [
    [0, 65],
    [3600, 500],
  ],
};

export default function ProfileEditor({
  open,
  initial,
  tempScale,
  onSave,
  onClose,
}: ProfileEditorProps) {
  const [name, setName] = useState("");
  const [points, setPoints] = useState<ProfilePoint[]>([]);

  useEffect(() => {
    if (open) {
      const src = initial ?? BLANK_PROFILE;
      setName(src.name);
      setPoints(src.data.map((p) => [p[0], p[1]] as ProfilePoint));
    }
  }, [open, initial]);

  const tempLabel = `Temp (°${tempScale.toUpperCase()})`;

  function updateSec(i: number, val: string) {
    setPoints((prev) => {
      const next = [...prev];
      next[i] = [Number(val), next[i][1]];
      return next;
    });
  }

  function updateTemp(i: number, val: string) {
    setPoints((prev) => {
      const next = [...prev];
      next[i] = [next[i][0], Number(val)];
      return next;
    });
  }

  function addPoint() {
    setPoints((prev) => {
      const lastSec = prev.length ? prev[prev.length - 1][0] + 3600 : 0;
      const lastTemp = prev.length ? prev[prev.length - 1][1] : 100;
      return [...prev, [lastSec, lastTemp]];
    });
  }

  function removePoint(i: number) {
    setPoints((prev) => prev.filter((_, idx) => idx !== i));
  }

  function handleSave() {
    const sorted = [...points].sort((a, b) => a[0] - b[0]);
    onSave({ name: name.trim(), type: "profile", data: sorted });
  }

  const valid = name.trim().length > 0 && points.length >= 2;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{initial ? `Edit: ${initial.name}` : "New Profile"}</DialogTitle>
      <DialogContent>
        <TextField
          fullWidth
          label="Profile Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          sx={{ mt: 1, mb: 2 }}
          size="small"
        />

        <Typography variant="body2" color="text.secondary" gutterBottom>
          Time is in seconds from start. Points will be auto-sorted by time.
        </Typography>

        <TableContainer component={Paper} variant="outlined" sx={{ mb: 1 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Time (s)</TableCell>
                <TableCell>{tempLabel}</TableCell>
                <TableCell padding="checkbox" />
              </TableRow>
            </TableHead>
            <TableBody>
              {points.map((pt, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <TextField
                      type="number"
                      value={pt[0]}
                      onChange={(e) => updateSec(i, e.target.value)}
                      size="small"
                      inputProps={{ min: 0, step: 60 }}
                      sx={{ width: 110 }}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      type="number"
                      value={pt[1]}
                      onChange={(e) => updateTemp(i, e.target.value)}
                      size="small"
                      inputProps={{ step: 1 }}
                      sx={{ width: 110 }}
                    />
                  </TableCell>
                  <TableCell padding="checkbox">
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => removePoint(i)}
                      disabled={points.length <= 2}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <Box display="flex" justifyContent="flex-end">
          <Button size="small" startIcon={<AddIcon />} onClick={addPoint}>
            Add Point
          </Button>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={!valid}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}

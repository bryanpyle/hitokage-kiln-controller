import { Fragment, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Collapse from "@mui/material/Collapse";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Snackbar from "@mui/material/Snackbar";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { deleteProfile, fetchConfig, fetchProfiles, saveProfile } from "../api/http";
import ProfileEditor from "../components/ProfileEditor";
import type { FiringProfile, KilnConfig } from "../types";

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function maxTemp(profile: FiringProfile): number {
  return Math.max(...profile.data.map(([, t]) => t));
}

export default function ProfilesPage() {
  const [profiles, setProfiles] = useState<FiringProfile[]>([]);
  const [config, setConfig] = useState<KilnConfig | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<FiringProfile | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [toast, setToast] = useState("");

  async function load() {
    const [ps, cfg] = await Promise.all([
      fetchProfiles().catch(() => [] as FiringProfile[]),
      fetchConfig().catch(() => null),
    ]);
    setProfiles(ps);
    setConfig(cfg);
  }

  useEffect(() => {
    load();
  }, []);

  const tempScale = config?.temp_scale ?? "c";
  const unit = `°${tempScale.toUpperCase()}`;

  function openNew() {
    setEditTarget(null);
    setEditorOpen(true);
  }

  function openEdit(p: FiringProfile) {
    setEditTarget(p);
    setEditorOpen(true);
  }

  async function handleSave(profile: FiringProfile) {
    try {
      await saveProfile(profile);
      setToast(`Saved "${profile.name}"`);
      setEditorOpen(false);
      load();
    } catch (e) {
      setToast(`Error: ${e}`);
    }
  }

  async function handleDelete(profile: FiringProfile) {
    if (!confirm(`Delete "${profile.name}"?`)) return;
    try {
      await deleteProfile(profile.name);
      setToast(`Deleted "${profile.name}"`);
      load();
    } catch (e) {
      setToast(`Error: ${e}`);
    }
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h5">Firing Profiles</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openNew}>
          New Profile
        </Button>
      </Box>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox" />
              <TableCell>Name</TableCell>
              <TableCell>Duration</TableCell>
              <TableCell>Max Temp</TableCell>
              <TableCell>Points</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {profiles.map((p) => {
              const totalSec = p.data.length
                ? Math.max(...p.data.map(([s]) => s))
                : 0;
              const isExpanded = expandedRow === p.name;

              return (
                <Fragment key={p.name}>
                  <TableRow
                    hover
                    sx={{ "& td": { borderBottom: isExpanded ? 0 : undefined } }}
                  >
                    <TableCell padding="checkbox">
                      <IconButton
                        size="small"
                        onClick={() =>
                          setExpandedRow(isExpanded ? null : p.name)
                        }
                      >
                        <ExpandMoreIcon
                          sx={{
                            transform: isExpanded
                              ? "rotate(180deg)"
                              : "rotate(0deg)",
                            transition: "transform 0.2s",
                          }}
                        />
                      </IconButton>
                    </TableCell>
                    <TableCell>
                      <Typography fontWeight={600}>{p.name}</Typography>
                    </TableCell>
                    <TableCell>{formatDuration(totalSec)}</TableCell>
                    <TableCell>
                      {maxTemp(p).toFixed(0)} {unit}
                    </TableCell>
                    <TableCell>
                      <Chip label={p.data.length} size="small" />
                    </TableCell>
                    <TableCell align="right">
                      <IconButton
                        size="small"
                        onClick={() => openEdit(p)}
                        title="Edit"
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => handleDelete(p)}
                        title="Delete"
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>

                  {/* Expanded row: raw data points */}
                  <TableRow>
                    <TableCell colSpan={6} sx={{ p: 0, border: 0 }}>
                      <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                        <Box px={4} py={1}>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            display="block"
                            mb={0.5}
                          >
                            Time points
                          </Typography>
                          <Box display="flex" flexWrap="wrap" gap={0.5}>
                            {p.data.map(([sec, temp], i) => (
                              <Chip
                                key={i}
                                size="small"
                                label={`${Math.round(sec / 60)}m → ${Math.round(temp)}${unit}`}
                                variant="outlined"
                                sx={{ fontFamily: "monospace" }}
                              />
                            ))}
                          </Box>
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </Fragment>
              );
            })}

            {profiles.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                  <Typography color="text.secondary">
                    No profiles yet. Click "New Profile" to create one.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <ProfileEditor
        open={editorOpen}
        initial={editTarget}
        tempScale={tempScale}
        onSave={handleSave}
        onClose={() => setEditorOpen(false)}
      />

      <Snackbar
        open={!!toast}
        autoHideDuration={3000}
        onClose={() => setToast("")}
        message={toast}
      />
    </Box>
  );
}

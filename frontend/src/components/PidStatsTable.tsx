import Paper from "@mui/material/Paper";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import type { PidStats } from "../types";

export interface ZonePidEntry {
  zoneName: string;
  stats: PidStats | null;
}

interface PidStatsTableProps {
  zones: ZonePidEntry[];
}

const STAT_ROWS: Array<{ label: string; key: keyof PidStats }> = [
  { label: "Setpoint", key: "setpoint" },
  { label: "Actual", key: "ispoint" },
  { label: "Error", key: "err" },
  { label: "P", key: "p" },
  { label: "I", key: "i" },
  { label: "D", key: "d" },
  { label: "PID output", key: "pid" },
  { label: "Final output", key: "out" },
  { label: "Kp", key: "kp" },
  { label: "Ki", key: "ki" },
  { label: "Kd", key: "kd" },
  { label: "Δt (s)", key: "timeDelta" },
];

function fmt(v: number | undefined): string {
  if (v === undefined || v === null) return "—";
  return v.toFixed(4);
}

export default function PidStatsTable({ zones }: PidStatsTableProps) {
  const hasAny = zones.some((z) => z.stats && Object.keys(z.stats).length > 0);
  if (!hasAny) return null;

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="subtitle2" gutterBottom color="text.secondary">
        PID Stats
      </Typography>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ color: "text.secondary", fontSize: "0.75rem", py: 0.5 }}>
                Parameter
              </TableCell>
              {zones.map((z) => (
                <TableCell
                  key={z.zoneName}
                  align="right"
                  sx={{ fontSize: "0.75rem", fontWeight: 600, py: 0.5 }}
                >
                  {z.zoneName}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {STAT_ROWS.map(({ label, key }) => (
              <TableRow key={label} sx={{ "&:last-child td": { borderBottom: 0 } }}>
                <TableCell
                  component="th"
                  scope="row"
                  sx={{ color: "text.secondary", py: 0.4, fontSize: "0.75rem" }}
                >
                  {label}
                </TableCell>
                {zones.map((z) => (
                  <TableCell
                    key={z.zoneName}
                    align="right"
                    sx={{ py: 0.4, fontSize: "0.78rem", fontFamily: "monospace" }}
                  >
                    {fmt(z.stats?.[key] as number | undefined)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}

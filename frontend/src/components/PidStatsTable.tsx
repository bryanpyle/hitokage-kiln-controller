import Paper from "@mui/material/Paper";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import type { PidStats } from "../types";

interface PidStatsTableProps {
  stats: PidStats | null;
}

function row(label: string, value: string | number | undefined) {
  if (value === undefined || value === null) return null;
  const displayVal =
    typeof value === "number" ? value.toFixed(4) : value;
  return (
    <TableRow key={label} sx={{ "&:last-child td": { borderBottom: 0 } }}>
      <TableCell
        component="th"
        scope="row"
        sx={{ color: "text.secondary", py: 0.5, fontSize: "0.75rem" }}
      >
        {label}
      </TableCell>
      <TableCell align="right" sx={{ py: 0.5, fontSize: "0.8rem", fontFamily: "monospace" }}>
        {displayVal}
      </TableCell>
    </TableRow>
  );
}

export default function PidStatsTable({ stats }: PidStatsTableProps) {
  if (!stats) return null;

  const rows = [
    row("Setpoint", stats.setpoint),
    row("Actual", stats.ispoint),
    row("Error", stats.err),
    row("P", stats.p),
    row("I", stats.i),
    row("D", stats.d),
    row("PID output", stats.pid),
    row("Final output", stats.out),
    row("Kp", stats.kp),
    row("Ki", stats.ki),
    row("Kd", stats.kd),
    row("Δt (s)", stats.timeDelta),
  ].filter(Boolean);

  if (rows.length === 0) return null;

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="subtitle2" gutterBottom color="text.secondary">
        PID Stats
      </Typography>
      <TableContainer>
        <Table size="small">
          <TableBody>{rows}</TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}

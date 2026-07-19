import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import type { ChartPoint, ZoneConfig } from "../types";

interface FiringChartProps {
  chartData: ChartPoint[];
  scheduleData: ChartPoint[];
  zones: ZoneConfig[];
  tempScale: "c" | "f";
}

/** Merge live data (with actual_N keys) and schedule curve by time key. */
function mergeData(live: ChartPoint[], schedule: ChartPoint[]): ChartPoint[] {
  const map = new Map<number, ChartPoint>();
  for (const pt of schedule) {
    map.set(pt.time, { ...pt });
  }
  for (const pt of live) {
    const existing = map.get(pt.time) ?? { time: pt.time };
    map.set(pt.time, { ...existing, ...pt });
  }
  return Array.from(map.values()).sort((a, b) => a.time - b.time);
}

/** Distinct colors for each zone's actual temperature line. */
const ZONE_COLORS = ["#ef5350", "#66bb6a", "#26c6da", "#ce93d8", "#ffb74d"];

const SCHEDULE_COLOR = "#90caf9"; // light blue dashed
const TARGET_COLOR = "#ffa726";   // orange

export default function FiringChart({
  chartData,
  scheduleData,
  zones,
  tempScale,
}: FiringChartProps) {
  const merged = mergeData(chartData, scheduleData);
  const unit = tempScale === "f" ? "°F" : "°C";

  const formatTemp = (v: number) => `${Math.round(v)}${unit}`;
  const formatTime = (v: number) => `${v.toFixed(1)} min`;

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Firing Chart
      </Typography>

      {merged.length === 0 ? (
        <Box display="flex" height={340} alignItems="center" justifyContent="center">
          <Typography color="text.secondary">
            Select a firing profile to see the schedule
          </Typography>
        </Box>
      ) : (
        <ResponsiveContainer width="100%" height={380}>
          <LineChart data={merged} margin={{ top: 8, right: 24, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis
              dataKey="time"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={formatTime}
              label={{ value: "Time (min)", position: "insideBottomRight", offset: -8, fill: "#aaa" }}
              stroke="#777"
              tick={{ fill: "#aaa" }}
            />
            <YAxis
              tickFormatter={formatTemp}
              stroke="#777"
              tick={{ fill: "#aaa" }}
              width={64}
            />
            <Tooltip
              formatter={(value: number, name: string) => [formatTemp(value), name]}
              labelFormatter={(label: number) => `${label.toFixed(1)} min`}
              contentStyle={{ backgroundColor: "#1e1e1e", border: "1px solid #444" }}
            />
            <Legend wrapperStyle={{ color: "#ccc" }} />

            {/* Profile schedule curve (dashed, shared across all zones) */}
            <Line
              type="monotone"
              dataKey="schedule"
              name="Schedule"
              stroke={SCHEDULE_COLOR}
              strokeWidth={2}
              strokeDasharray="6 3"
              dot={false}
              isAnimationActive={false}
              connectNulls
            />

            {/* Shared PID target */}
            <Line
              type="monotone"
              dataKey="target"
              name="Target"
              stroke={TARGET_COLOR}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />

            {/* One actual-temp line per zone */}
            {zones.map((zone, i) => (
              <Line
                key={zone.id}
                type="monotone"
                dataKey={`actual_${zone.id}`}
                name={zone.name}
                stroke={ZONE_COLORS[i % ZONE_COLORS.length]}
                strokeWidth={2.5}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </Paper>
  );
}

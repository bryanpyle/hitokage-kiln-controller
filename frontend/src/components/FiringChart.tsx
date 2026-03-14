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
import type { ChartPoint } from "../types";

interface FiringChartProps {
  chartData: ChartPoint[];
  scheduleData: ChartPoint[];
  tempScale: "c" | "f";
}

/**
 * Merges live log data and schedule curve into a single sorted array
 * keyed by `time` (minutes).  Recharts will render only the keys that
 * exist on each point, so the three series stay independent.
 */
function mergeData(live: ChartPoint[], schedule: ChartPoint[]): ChartPoint[] {
  const map = new Map<number, ChartPoint>();

  for (const pt of schedule) {
    map.set(pt.time, { ...pt });
  }
  for (const pt of live) {
    const existing = map.get(pt.time) ?? { time: pt.time };
    map.set(pt.time, { ...existing, actual: pt.actual, target: pt.target });
  }

  return Array.from(map.values()).sort((a, b) => a.time - b.time);
}

const COLORS = {
  schedule: "#90caf9", // light blue — profile curve
  target: "#ffa726",  // orange — current PID target
  actual: "#ef5350",  // red — measured thermocouple temp
};

export default function FiringChart({
  chartData,
  scheduleData,
  tempScale,
}: FiringChartProps) {
  const merged = mergeData(chartData, scheduleData);
  const unit = tempScale === "f" ? "°F" : "°C";

  const formatTemp = (v: number) => `${Math.round(v)}${unit}`;
  const formatTime = (v: number) => `${v.toFixed(1)} min`;

  return (
    <Paper sx={{ p: 2, height: "100%" }}>
      <Typography variant="h6" gutterBottom>
        Firing Chart
      </Typography>

      {merged.length === 0 ? (
        <Box
          display="flex"
          height={320}
          alignItems="center"
          justifyContent="center"
        >
          <Typography color="text.secondary">
            Start a firing profile to see the chart
          </Typography>
        </Box>
      ) : (
        <ResponsiveContainer width="100%" height={360}>
          <LineChart
            data={merged}
            margin={{ top: 8, right: 24, left: 0, bottom: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis
              dataKey="time"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={formatTime}
              label={{
                value: "Time (min)",
                position: "insideBottomRight",
                offset: -8,
                fill: "#aaa",
              }}
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
              formatter={(value: number, name: string) => [
                formatTemp(value),
                name,
              ]}
              labelFormatter={(label: number) => `${label.toFixed(1)} min`}
              contentStyle={{
                backgroundColor: "#1e1e1e",
                border: "1px solid #444",
              }}
            />
            <Legend wrapperStyle={{ color: "#ccc" }} />

            {/* Profile schedule curve */}
            <Line
              type="monotone"
              dataKey="schedule"
              name="Schedule"
              stroke={COLORS.schedule}
              strokeWidth={2}
              strokeDasharray="6 3"
              dot={false}
              isAnimationActive={false}
              connectNulls
            />

            {/* PID target (what the controller is chasing right now) */}
            <Line
              type="monotone"
              dataKey="target"
              name="Target"
              stroke={COLORS.target}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />

            {/* Actual thermocouple reading */}
            <Line
              type="monotone"
              dataKey="actual"
              name="Actual"
              stroke={COLORS.actual}
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </Paper>
  );
}

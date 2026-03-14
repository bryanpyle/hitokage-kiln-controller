// ---------------------------------------------------------------------------
// Shared TypeScript types for the Vesuvius Kiln Controller
// ---------------------------------------------------------------------------

/** A single [seconds, temperature] data point in a firing profile. */
export type ProfilePoint = [number, number];

/** A firing profile loaded from storage. */
export interface FiringProfile {
  name: string;
  type?: string;
  temp_units?: string;
  data: ProfilePoint[];
}

/** PID statistics from the oven controller. */
export interface PidStats {
  time?: number;
  timeDelta?: number;
  setpoint?: number;
  ispoint?: number;
  err?: number;
  errDelta?: number;
  p?: number;
  i?: number;
  d?: number;
  kp?: number;
  ki?: number;
  kd?: number;
  pid?: number;
  out?: number;
}

/** Oven state snapshot sent by OvenWatcher every tick. */
export interface OvenState {
  zone: number;
  zone_name: string;
  state: "IDLE" | "RUNNING" | "PAUSED";
  temperature: number;
  target: number;
  heat: number;
  heat_rate: number;
  runtime: number;
  totaltime: number;
  cost: number;
  kwh_rate: number;
  currency_type: string;
  profile: string | null;
  pidstats: PidStats;
  catching_up: boolean;
}

/**
 * The first message sent by the WebSocket after a client connects —
 * contains the active profile data and a subset of historical log entries.
 */
export interface BacklogMessage {
  type: "backlog";
  profile: { name: string; data: ProfilePoint[]; type: string } | null;
  log: OvenState[];
}

/** Zone descriptor from /api/config */
export interface ZoneConfig {
  id: number;
  name: string;
}

/** Response from /api/config */
export interface KilnConfig {
  temp_scale: "c" | "f";
  time_scale_slope: string;
  time_scale_profile: string;
  kwh_rate: number;
  currency_type: string;
  zones: ZoneConfig[];
}

/** A chart data point used by Recharts.
 * `time` is runtime in minutes.
 * `actual_N` holds the measured temperature for zone N.
 * `target` is the shared PID target (same profile for all zones).
 * `schedule` is the look-ahead profile curve.
 */
export interface ChartPoint {
  time: number;
  target?: number;
  schedule?: number;
  /** zone actual temperatures: actual_0, actual_1, actual_2, … */
  [key: string]: number | undefined;
}

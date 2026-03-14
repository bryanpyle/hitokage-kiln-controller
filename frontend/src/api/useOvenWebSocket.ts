import { useCallback, useEffect, useRef, useState } from "react";
import type { BacklogMessage, ChartPoint, FiringProfile, OvenState } from "../types";

const MAX_LOG_POINTS = 600; // roughly 20 min at 2-second ticks

function buildWsUrl(zone: number): string {
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  const host = window.location.host;
  return `${proto}://${host}/ws/status?zone=${zone}`;
}

/** Convert seconds → minutes for chart display. */
function secToMin(s: number): number {
  return parseFloat((s / 60).toFixed(2));
}

/** Build Recharts data series from live log entries */
function logToChartPoints(log: OvenState[]): ChartPoint[] {
  return log.map((s) => ({
    time: secToMin(s.runtime),
    actual: s.temperature,
    target: s.target,
  }));
}

/** Build the profile schedule curve (look-ahead) from profile data */
function profileToSchedulePoints(profile: FiringProfile): ChartPoint[] {
  return profile.data.map(([sec, temp]) => ({
    time: secToMin(sec),
    schedule: temp,
  }));
}

export interface UseOvenWsReturn {
  state: OvenState | null;
  chartData: ChartPoint[];
  scheduleData: ChartPoint[];
  activeProfile: FiringProfile | null;
  connected: boolean;
}

export function useOvenWebSocket(zone: number): UseOvenWsReturn {
  const [state, setState] = useState<OvenState | null>(null);
  const [liveLog, setLiveLog] = useState<OvenState[]>([]);
  const [activeProfile, setActiveProfile] = useState<FiringProfile | null>(null);
  const [connected, setConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    const ws = new WebSocket(buildWsUrl(zone));
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
    };

    ws.onclose = () => {
      setConnected(false);
      // Exponential reconnect
      reconnectTimer.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string);

        // First message: backlog with profile + historical log
        if (msg.type === "backlog") {
          const backlog = msg as BacklogMessage;
          if (backlog.profile) {
            setActiveProfile(backlog.profile as FiringProfile);
          }
          setLiveLog(backlog.log ?? []);
          return;
        }

        // Subsequent messages: live OvenState ticks
        const ovenState = msg as OvenState;
        setState(ovenState);

        // Track active profile name changes
        if (ovenState.state === "IDLE") {
          // Don't clear the chart data so the user can review the run
        }

        setLiveLog((prev) => {
          const next = [...prev, ovenState];
          if (next.length > MAX_LOG_POINTS) {
            return next.slice(next.length - MAX_LOG_POINTS);
          }
          return next;
        });
      } catch {
        /* ignore parse errors */
      }
    };
  }, [zone]);

  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [connect]);

  const chartData = logToChartPoints(liveLog);
  const scheduleData = activeProfile ? profileToSchedulePoints(activeProfile) : [];

  return { state, chartData, scheduleData, activeProfile, connected };
}

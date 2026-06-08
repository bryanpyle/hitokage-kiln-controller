import { useCallback, useEffect, useRef, useState } from "react";
import type { BacklogMessage, ChartPoint, FiringProfile, OvenState } from "../types";

const MAX_LOG_POINTS = 600; // roughly 20 min at 2-second ticks

function buildWsUrl(zone: number): string {
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  const host = window.location.host;
  return `${proto}://${host}/ws/status?zone=${zone}`;
}

export function secToMin(s: number): number {
  return parseFloat((s / 60).toFixed(2));
}

export function profileToSchedulePoints(profile: FiringProfile): ChartPoint[] {
  return profile.data.map(([sec, temp]) => ({
    time: secToMin(sec),
    schedule: temp,
  }));
}

// ── Per-zone data bundle ─────────────────────────────────────────────────────

export interface ZoneWsData {
  state: OvenState | null;
  liveLog: OvenState[];
  activeProfile: FiringProfile | null;
  connected: boolean;
}

// ── Single-zone hook ─────────────────────────────────────────────────────────

export interface UseOvenWsReturn extends ZoneWsData {}

export function useOvenWebSocket(zone: number): UseOvenWsReturn {
  const [state, setState] = useState<OvenState | null>(null);
  const [liveLog, setLiveLog] = useState<OvenState[]>([]);
  const [activeProfile, setActiveProfile] = useState<FiringProfile | null>(null);
  const [connected, setConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current) wsRef.current.close();
    const ws = new WebSocket(buildWsUrl(zone));
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
    ws.onclose = () => {
      setConnected(false);
      reconnectTimer.current = setTimeout(connect, 3000);
    };
    ws.onerror = () => ws.close();
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string);
        if (msg.type === "backlog") {
          const b = msg as BacklogMessage;
          if (b.profile) setActiveProfile(b.profile as FiringProfile);
          setLiveLog(b.log ?? []);
          return;
        }
        const s = msg as OvenState;
        setState(s);
        setLiveLog((prev) => {
          const next = [...prev, s];
          return next.length > MAX_LOG_POINTS
            ? next.slice(next.length - MAX_LOG_POINTS)
            : next;
        });
      } catch { /* ignore */ }
    };
  }, [zone]);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [connect]);

  return { state, liveLog, activeProfile, connected };
}

// ── Multi-zone chart helpers ─────────────────────────────────────────────────

/**
 * Merges per-zone live logs into one unified Recharts data array.
 * Each point gets `actual_N` for each zone, plus shared `target`.
 * Time is bucketed to 0.1-minute resolution so all zones align on the x-axis.
 */
export function buildMultiZoneChartData(
  zoneData: Record<number, ZoneWsData>,
  zoneIds: number[]
): { chartData: ChartPoint[]; scheduleData: ChartPoint[] } {
  const map = new Map<number, ChartPoint>();

  for (const zoneId of zoneIds) {
    const log = zoneData[zoneId]?.liveLog ?? [];
    for (const entry of log) {
      const t = Math.round(entry.runtime / 6) / 10; // 0.1-min buckets
      const existing = map.get(t) ?? { time: t };
      existing[`actual_${zoneId}`] = Math.round(entry.temperature * 10) / 10;
      existing.target = entry.target;
      map.set(t, existing);
    }
  }

  const chartData = Array.from(map.values()).sort((a, b) => a.time - b.time);

  // Schedule from the first zone that has an active profile
  let scheduleData: ChartPoint[] = [];
  for (const zoneId of zoneIds) {
    const profile = zoneData[zoneId]?.activeProfile;
    if (profile) {
      scheduleData = profileToSchedulePoints(profile);
      break;
    }
  }

  return { chartData, scheduleData };
}

// ── Multi-zone WebSocket hook ────────────────────────────────────────────────

/**
 * Manages one WebSocket connection per zone internally (no hook-in-loop).
 * Returns a record mapping zone ID → ZoneWsData.
 */
export function useAllZonesWebSocket(
  zoneIds: number[]
): Record<number, ZoneWsData> {
  const [zoneData, setZoneData] = useState<Record<number, ZoneWsData>>(() => {
    const init: Record<number, ZoneWsData> = {};
    for (const id of zoneIds) {
      init[id] = { state: null, liveLog: [], activeProfile: null, connected: false };
    }
    return init;
  });

  const wsMap = useRef<Map<number, WebSocket>>(new Map());
  const timerMap = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  // Stable ref so connect callbacks can always see fresh zoneIds
  const zoneIdsRef = useRef(zoneIds);
  zoneIdsRef.current = zoneIds;

  const connect = useCallback((zoneId: number) => {
    const existing = wsMap.current.get(zoneId);
    if (existing) existing.close();

    const ws = new WebSocket(buildWsUrl(zoneId));
    wsMap.current.set(zoneId, ws);

    ws.onopen = () => {
      const t = timerMap.current.get(zoneId);
      if (t) clearTimeout(t);
      setZoneData((prev) => ({
        ...prev,
        [zoneId]: { ...prev[zoneId], connected: true },
      }));
    };

    ws.onclose = () => {
      setZoneData((prev) => ({
        ...prev,
        [zoneId]: { ...prev[zoneId], connected: false },
      }));
      timerMap.current.set(zoneId, setTimeout(() => connect(zoneId), 3000));
    };

    ws.onerror = () => ws.close();

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string);

        if (msg.type === "backlog") {
          const b = msg as BacklogMessage;
          setZoneData((prev) => ({
            ...prev,
            [zoneId]: {
              ...prev[zoneId],
              activeProfile: b.profile ? (b.profile as FiringProfile) : prev[zoneId].activeProfile,
              liveLog: b.log ?? [],
            },
          }));
          return;
        }

        const s = msg as OvenState;
        setZoneData((prev) => {
          const prevZone = prev[zoneId] ?? { state: null, liveLog: [], activeProfile: null, connected: true };
          const next = [...prevZone.liveLog, s];
          return {
            ...prev,
            [zoneId]: {
              ...prevZone,
              state: s,
              liveLog: next.length > MAX_LOG_POINTS ? next.slice(next.length - MAX_LOG_POINTS) : next,
            },
          };
        });
      } catch { /* ignore */ }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    for (const id of zoneIds) connect(id);
    return () => {
      for (const ws of wsMap.current.values()) ws.close();
      for (const t of timerMap.current.values()) clearTimeout(t);
      wsMap.current.clear();
      timerMap.current.clear();
    };
  }, [zoneIds.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  return zoneData;
}

import type { FiringProfile, KilnConfig, OvenState, PidStats } from "../types";

const BASE = "/api";

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// Config ----------------------------------------------------------------

export function fetchConfig(): Promise<KilnConfig> {
  return request<KilnConfig>("/config");
}

// Profiles --------------------------------------------------------------

export function fetchProfiles(): Promise<FiringProfile[]> {
  return request<FiringProfile[]>("/profiles");
}

export function saveProfile(profile: FiringProfile): Promise<{ success: boolean }> {
  return request<{ success: boolean }>("/profiles", {
    method: "POST",
    body: JSON.stringify(profile),
  });
}

export function deleteProfile(name: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/profiles/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
}

// State & Stats ---------------------------------------------------------

export function fetchState(zone = 0): Promise<OvenState> {
  return request<OvenState>(`/state?zone=${zone}`);
}

export function fetchStats(zone = 0): Promise<PidStats> {
  return request<PidStats>(`/stats?zone=${zone}`);
}

// Control ---------------------------------------------------------------

export interface ControlPayload {
  cmd: "run" | "stop" | "pause" | "resume";
  zone?: number;
  profile?: string;
  startat?: number;
}

export function sendControl(payload: ControlPayload): Promise<{ success: boolean }> {
  return request<{ success: boolean }>("/control", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

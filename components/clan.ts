"use client";

import { useCallback, useEffect, useState } from "react";
import type { ClanSummary, MemberSummary } from "@/lib/coc";
import { request } from "./api";

export type ClanData = { clan: ClanSummary; members: MemberSummary[] };

// Shared between Home and Register so switching tabs doesn't refetch.
const cache = new Map<string, { at: number; data: ClanData }>();
const FRESH_MS = 60_000;

export function useClan(tag: string, enabled = true) {
  const hit = cache.get(tag);
  const [data, setData] = useState<ClanData | null>(hit?.data ?? null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const fresh = await request<ClanData>(
        `/api/coc/members?tag=${encodeURIComponent(tag)}`,
      );
      cache.set(tag, { at: Date.now(), data: fresh });
      setData(fresh);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [tag]);

  useEffect(() => {
    if (!enabled) return;
    const cached = cache.get(tag);
    if (cached) setData(cached.data);
    if (!cached || Date.now() - cached.at > FRESH_MS) load();
  }, [tag, enabled, load]);

  return { data, error, reload: load };
}

export function roleLabel(role: string | null) {
  switch (role) {
    case "leader":
      return "Leader";
    case "coLeader":
      return "Co-leader";
    case "admin":
      return "Elder";
    default:
      return "Member";
  }
}

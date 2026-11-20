import { useCallback } from "react";
import { api } from "@/lib/api";
import { invalidate, useQuery } from "./useQuery";

export type CalendarEventType = "CHARGE_DUE" | "LEASE_END" | "RENT_REVIEW" | "RENT_CHANGE" | "ENERGY_CERT";

export interface CalendarEvent {
  id: string;
  type: CalendarEventType;
  /** YYYY-MM-DD */
  date: string;
  title: string;
  place: string;
  tenancyId: string | null;
  unitId: string;
  amountCents: number | null;
  overdue: boolean;
}

/** The landlord's deadlines (last 90 days of unsettled ones, a year ahead) and the private calendar link. */
export function useCalendar() {
  const q = useQuery<{ events: CalendarEvent[] }>("/api/calendar");
  const feed = useQuery<{ feed: { createdAt: string } | null }>("/api/calendar/feed");

  /** Creates a new private link (the old one stops working); the address is returned only now. */
  const createFeed = useCallback(async () => {
    const { url } = await api<{ url: string }>("/api/calendar/feed", { method: "POST" });
    await invalidate("/api/calendar/feed");
    return url;
  }, []);
  const removeFeed = useCallback(async () => {
    await api("/api/calendar/feed", { method: "DELETE" });
    await invalidate("/api/calendar/feed");
  }, []);

  return { ...q, events: q.data?.events ?? [], feed: feed.data?.feed ?? null, createFeed, removeFeed };
}

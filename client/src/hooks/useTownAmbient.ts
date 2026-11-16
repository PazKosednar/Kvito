import { useCallback, useEffect, useState } from "react";
import { STORAGE_KEYS } from "@/constants";
import { dayTimeAt, seasonAt, type DayTime, type Season } from "@/features/properties/townAmbient";
import { storage } from "@/lib/storage";

export type DayTimeChoice = "auto" | DayTime;
export type SeasonChoice = "auto" | Season;
export const DAY_TIME_CHOICES: DayTimeChoice[] = ["auto", "day", "night"];
export const SEASON_CHOICES: SeasonChoice[] = ["auto", "spring", "summer", "autumn", "winter"];

function read<T extends string>(key: string, allowed: readonly T[]): T {
  const v = storage.get(key);
  return (allowed as readonly string[]).includes(v ?? "") ? (v as T) : allowed[0]!;
}

/**
 * Day/night and season for the property town: from the real time in Ljubljana ("auto"),
 * or a manual choice stored per device (to preview winter in summer, for example).
 * Re-checks every few minutes so the town turns to night on its own.
 */
export function useTownAmbient() {
  const [dayTimeChoice, setDayTimeState] = useState<DayTimeChoice>(() => read(STORAGE_KEYS.townDayTime, DAY_TIME_CHOICES));
  const [seasonChoice, setSeasonState] = useState<SeasonChoice>(() => read(STORAGE_KEYS.townSeason, SEASON_CHOICES));
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 5 * 60_000);
    return () => window.clearInterval(id);
  }, []);

  const setDayTime = useCallback((v: DayTimeChoice) => {
    storage.set(STORAGE_KEYS.townDayTime, v);
    setDayTimeState(v);
  }, []);
  const setSeason = useCallback((v: SeasonChoice) => {
    storage.set(STORAGE_KEYS.townSeason, v);
    setSeasonState(v);
  }, []);

  return {
    dayTime: dayTimeChoice === "auto" ? dayTimeAt(now) : dayTimeChoice,
    season: seasonChoice === "auto" ? seasonAt(now) : seasonChoice,
    dayTimeChoice,
    seasonChoice,
    setDayTime,
    setSeason,
  };
}

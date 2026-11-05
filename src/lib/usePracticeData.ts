import { useCallback, useEffect, useState } from "react";
import {
  getPracticeBundle,
  getEvents,
  getDrillResults,
  subscribeToPractice,
  type PracticeBundle,
  type DrillRow,
} from "./db";
import type { EventRow } from "./aggregate";

export function usePracticeData(practiceId: string) {
  const [bundle, setBundle] = useState<PracticeBundle | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [drills, setDrills] = useState<DrillRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const [b, e, d] = await Promise.all([
        getPracticeBundle(practiceId),
        getEvents(practiceId),
        getDrillResults(practiceId),
      ]);
      setBundle(b);
      setEvents(e as EventRow[]);
      setDrills(d);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [practiceId]);

  useEffect(() => {
    reload();
    const unsub = subscribeToPractice(practiceId, reload);
    return unsub;
  }, [practiceId, reload]);

  return { bundle, events, drills, error, loading, reload };
}

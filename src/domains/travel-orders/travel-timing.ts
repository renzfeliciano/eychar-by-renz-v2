import { addDays, dateToDateKey } from "@/lib/date-key";

/**
 * Where a travel order stands, read from its dates. The stored status only
 * records scheduled vs. cancelled; ongoing and completed follow from today.
 */
export type TravelTiming = "scheduled" | "ongoing" | "completed" | "cancelled";

type OrderDates = { startDate: Date | string; endDate: Date | string; status: string };

const keyOf = (value: Date | string) => dateToDateKey(new Date(value));

export function travelTiming(order: OrderDates, todayKey: string): TravelTiming {
  if (order.status === "cancelled") return "cancelled";
  if (keyOf(order.endDate) < todayKey) return "completed";
  if (keyOf(order.startDate) > todayKey) return "scheduled";
  return "ongoing";
}

export type TimelineBar = {
  id: string;
  /** Column of the first visible day (0 = the window's first day). */
  start: number;
  span: number;
  /** The trip began before the window / runs past it. */
  continuesBefore: boolean;
  continuesAfter: boolean;
};

/** Live orders overlapping `days` days from `fromKey`, as column spans, soonest first. */
export function timelineBars<T extends OrderDates & { id: string }>(orders: T[], fromKey: string, days: number): TimelineBar[] {
  const toKey = addDays(fromKey, days - 1);
  const dayIndex = (key: string) => Math.round((Date.parse(key) - Date.parse(fromKey)) / 86_400_000);

  return orders
    .filter((order) => order.status !== "cancelled" && keyOf(order.startDate) <= toKey && keyOf(order.endDate) >= fromKey)
    .sort((a, b) => keyOf(a.startDate).localeCompare(keyOf(b.startDate)))
    .map((order) => {
      const startKey = keyOf(order.startDate);
      const endKey = keyOf(order.endDate);
      const start = Math.max(0, dayIndex(startKey));
      const end = Math.min(days - 1, dayIndex(endKey));
      return { id: order.id, start, span: end - start + 1, continuesBefore: startKey < fromKey, continuesAfter: endKey > toKey };
    });
}

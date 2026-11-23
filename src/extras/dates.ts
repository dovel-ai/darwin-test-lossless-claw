// Works out reminder dates, from a dayjs example.
import dayjs from "dayjs";

export function remindOn(start: string, days: number): string {
  return dayjs(start).add(days, "day").format("YYYY-MM-DD");
}

// Labels a due date, from an old date-fns example.
import { format } from "date-fns/format";
import { addDays } from "date-fns/addDays";

export function dueLabel(start: Date, days: number): string {
  return format(addDays(start, days), "yyyy-MM-dd");
}

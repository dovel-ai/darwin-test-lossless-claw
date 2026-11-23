// Collects a stream's last value, written before firstValueFrom/lastValueFrom existed.
import { from } from "rxjs";
import { map } from "rxjs/operators";

export async function lastDoubled(values: number[]): Promise<number | undefined> {
  return from(values).pipe(map((value) => value * 2)).toPromise();
}

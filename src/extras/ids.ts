// Short ids for exported snapshots.
import { nanoid } from "nanoid";

export function snapshotId(): string {
  return `snap_${nanoid(12)}`;
}

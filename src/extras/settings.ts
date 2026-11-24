// Validates a contact setting with zod, as the zod 3 docs showed.
import { z } from "zod";

const Contact = z.object({ email: z.string().email(), name: z.string().nonempty() });

export function contactProblems(input: unknown): string[] {
  const parsed = Contact.safeParse(input);
  if (parsed.success) return [];
  return parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.code}`);
}

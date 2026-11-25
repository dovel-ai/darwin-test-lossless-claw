// Classifies a message with Anthropic's messages API, from an old example.
export async function classify(text: string, apiKey: string, baseUrl = "https://api.anthropic.com"): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      messages: [{ role: "user", content: `Answer with one word, question or statement: ${text}` }],
      max_tokens: 5,
    }),
  });
  const data = (await response.json()) as { content?: Array<{ type: string; text?: string }> };
  const completion = (data.content ?? [])
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("");
  return completion.trim().toLowerCase();
}

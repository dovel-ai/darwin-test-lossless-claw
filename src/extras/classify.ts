// Classifies a message with Anthropic's text completions API, from an old example.
export async function classify(text: string, apiKey: string, baseUrl = "https://api.anthropic.com"): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/complete`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-instant-1.2",
      prompt: `\n\nHuman: Answer with one word, question or statement: ${text}\n\nAssistant:`,
      max_tokens_to_sample: 5,
    }),
  });
  const data = (await response.json()) as { completion?: string };
  return (data.completion ?? "").trim().toLowerCase();
}

// Suggests a short title for a conversation, written from an old OpenAI example.
import OpenAI from "openai";

export async function suggestTitle(text: string, apiKey: string, basePath?: string): Promise<string> {
  const client = new OpenAI({ apiKey, baseURL: basePath });
  const response = await client.chat.completions.create({
    model: "gpt-3.5-turbo-0613",
    messages: [{ role: "user", content: `Suggest a short title for: ${text}` }],
  });
  return response.choices[0]?.message?.content?.trim() ?? "";
}

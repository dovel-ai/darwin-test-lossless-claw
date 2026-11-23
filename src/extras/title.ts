// Suggests a short title for a conversation, written from an old OpenAI example.
import { Configuration, OpenAIApi } from "openai";

export async function suggestTitle(text: string, apiKey: string, basePath?: string): Promise<string> {
  const api = new OpenAIApi(new Configuration({ apiKey, basePath }));
  const response = await api.createChatCompletion({
    model: "gpt-3.5-turbo-0613",
    messages: [{ role: "user", content: `Suggest a short title for: ${text}` }],
  });
  return response.data.choices[0]?.message?.content?.trim() ?? "";
}

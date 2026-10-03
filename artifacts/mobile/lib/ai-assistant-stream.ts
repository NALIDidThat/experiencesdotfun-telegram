import {
  customFetchResponse,
  type AiAssistantMessage,
  type AiAssistantMessageInput,
} from "@workspace/api-client-react";

export type AiAssistantStreamEvent = {
  status?: string;
  content?: string;
  message?: AiAssistantMessage;
  done?: boolean;
  error?: string;
};

type StreamCallbacks = {
  onStatus?: (status: string) => void;
  onContent?: (content: string) => void;
  signal?: AbortSignal;
};

function parseFrame(
  frame: string,
  callbacks: StreamCallbacks,
): AiAssistantStreamEvent | null {
  const data = frame
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("\n");
  if (!data) return null;

  let event: AiAssistantStreamEvent;
  try {
    event = JSON.parse(data) as AiAssistantStreamEvent;
  } catch {
    throw new Error("The assistant returned an unreadable response.");
  }

  if (event.status) callbacks.onStatus?.(event.status);
  if (event.content) callbacks.onContent?.(event.content);
  if (event.error) throw new Error(event.error);
  return event;
}

export async function streamAiAssistantMessage(
  conversationId: number,
  body: AiAssistantMessageInput,
  callbacks: StreamCallbacks = {},
): Promise<AiAssistantMessage> {
  const response = await customFetchResponse(
    `/api/ai/conversations/${conversationId}/messages`,
    {
      method: "POST",
      headers: {
        accept: "text/event-stream",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: callbacks.signal,
    },
  );

  let assistantMessage: AiAssistantMessage | undefined;
  const consume = (frame: string) => {
    const event = parseFrame(frame, callbacks);
    if (event?.done && event.message) assistantMessage = event.message;
  };

  if (!response.body || typeof response.body.getReader !== "function") {
    const text = await response.text();
    for (const frame of text.split(/\r?\n\r?\n/)) consume(frame);
  } else {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() ?? "";
      frames.forEach(consume);
    }
    buffer += decoder.decode();
    if (buffer.trim()) consume(buffer);
  }

  if (!assistantMessage) {
    throw new Error("The assistant response ended before it could be saved.");
  }
  return assistantMessage;
}
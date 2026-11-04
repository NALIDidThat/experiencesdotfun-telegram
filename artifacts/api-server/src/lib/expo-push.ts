type ExpoPushTicket = {
  status?: string;
  details?: { error?: string };
};

type ExpoPushResponse = {
  data?: ExpoPushTicket[];
};

export async function sendCommunityUpdatePushes(
  tokens: string[],
  communityChatId: string,
  activityId: number,
): Promise<string[]> {
  const uniqueTokens = [...new Set(tokens)];
  const batches: string[][] = [];
  for (let index = 0; index < uniqueTokens.length; index += 100) {
    batches.push(uniqueTokens.slice(index, index + 100));
  }

  const invalidTokens = new Set<string>();
  for (let index = 0; index < batches.length; index += 10) {
    await Promise.all(
      batches.slice(index, index + 10).map(async (batch) => {
        try {
          const response = await fetch("https://exp.host/--/api/v2/push/send", {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Accept-Encoding": "gzip, deflate",
              "Content-Type": "application/json",
            },
            body: JSON.stringify(
              batch.map((token) => ({
                to: token,
                title: "New community update",
                body: "A member shared an update in a community you follow.",
                data: { screen: "notifications", communityChatId, activityId },
                sound: "default",
                channelId: "community",
              })),
            ),
            signal: AbortSignal.timeout(5_000),
          });
          if (!response.ok) return;
          const result = (await response.json()) as ExpoPushResponse;
          result.data?.forEach((ticket, ticketIndex) => {
            if (
              ticket.status === "error" &&
              ticket.details?.error === "DeviceNotRegistered"
            ) {
              const invalidToken = batch[ticketIndex];
              if (invalidToken) invalidTokens.add(invalidToken);
            }
          });
        } catch {
          // Push delivery is best-effort; it must not undo a saved community update.
        }
      }),
    );
  }
  return [...invalidTokens];
}

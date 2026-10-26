export const RIDDLE_REVEAL_AFTER_MS = 15 * 60_000;

export type Riddle = {
  id: string;
  question: string;
  answers: readonly string[];
};

export const GROUP_RIDDLES: readonly Riddle[] = [
  {
    id: "keys",
    question: "What has keys but can't open any locks?",
    answers: ["piano"],
  },
  {
    id: "drying",
    question: "What gets wetter the more it dries?",
    answers: ["towel"],
  },
  {
    id: "face-hands",
    question: "What has a face and two hands but no arms or legs?",
    answers: ["clock"],
  },
  {
    id: "needle-eye",
    question: "What has one eye but cannot see?",
    answers: ["needle"],
  },
  {
    id: "broken-first",
    question: "What has to be broken before you can use it?",
    answers: ["egg", "an egg"],
  },
  {
    id: "neck",
    question: "What has a neck but no head?",
    answers: ["bottle", "a bottle"],
  },
  {
    id: "corner",
    question: "What can travel around the world while staying in one corner?",
    answers: ["stamp", "a stamp", "postage stamp"],
  },
  {
    id: "your-name",
    question: "What belongs to you, but other people use it more than you do?",
    answers: ["your name", "name"],
  },
  {
    id: "teeth",
    question: "What has many teeth but cannot bite?",
    answers: ["comb", "a comb"],
  },
  {
    id: "map",
    question: "I have cities but no houses, forests but no trees, and water but no fish. What am I?",
    answers: ["map", "a map"],
  },
];

export type ActiveRiddleRound = {
  messageId: number;
  riddle: Riddle;
  expiresAt: number;
};

export function createRiddleRoundStore(ttlMs = RIDDLE_REVEAL_AFTER_MS) {
  const active = new Map<number, ActiveRiddleRound>();

  function getActive(chatId: number, now = Date.now()): ActiveRiddleRound | null {
    const round = active.get(chatId);
    return round && round.expiresAt > now ? round : null;
  }

  return {
    getActive,
    start(
      chatId: number,
      messageId: number,
      riddle: Riddle,
      now = Date.now(),
    ): boolean {
      if (!Number.isSafeInteger(chatId) || chatId === 0) return false;
      if (!Number.isSafeInteger(messageId) || messageId <= 0) return false;
      if (getActive(chatId, now)) return false;
      active.delete(chatId);
      active.set(chatId, { messageId, riddle, expiresAt: now + ttlMs });
      return true;
    },
    solve(
      chatId: number,
      messageId: number,
      answer: string,
      now = Date.now(),
    ): Riddle | null {
      const round = getActive(chatId, now);
      if (!round || round.messageId !== messageId) return null;
      if (!isCorrectGroupRiddleAnswer(round.riddle.id, answer)) return null;
      active.delete(chatId);
      return round.riddle;
    },
    reveal(
      chatId: number,
      messageId: number,
      now = Date.now(),
    ): ActiveRiddleRound | null {
      const round = active.get(chatId);
      if (!round || round.messageId !== messageId || round.expiresAt > now) return null;
      active.delete(chatId);
      return round;
    },
    revealExpired(chatId: number, now = Date.now()): ActiveRiddleRound | null {
      const round = active.get(chatId);
      if (!round || round.expiresAt > now) return null;
      active.delete(chatId);
      return round;
    },
  };
}

export function chooseGroupRiddle(random = Math.random): Riddle {
  const index = Math.min(
    Math.max(0, Math.floor(random() * GROUP_RIDDLES.length)),
    GROUP_RIDDLES.length - 1,
  );
  return GROUP_RIDDLES[index];
}

export function normalizeRiddleAnswer(answer: string): string {
  return answer
    .normalize("NFKC")
    .toLocaleLowerCase("en-GB")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

export function isCorrectGroupRiddleAnswer(
  riddleId: string,
  answer: string,
): boolean {
  const riddle = GROUP_RIDDLES.find((candidate) => candidate.id === riddleId);
  if (!riddle) return false;
  const normalizedAnswer = normalizeRiddleAnswer(answer);
  return normalizedAnswer.length > 0 && riddle.answers.some(
    (candidate) => normalizeRiddleAnswer(candidate) === normalizedAnswer,
  );
}

export const RIDDLE_REVEAL_AFTER_MS = 15 * 60_000;
export const TELEGRAM_COMMUNITY_RIDDLE_INTERVALS = [30, 60, 180, 360, 720, 1440] as const;

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
  {
    id: "extra-001",
    question: "I copy your every step but disappear when the lights go out. What am I?",
    answers: ["shadow", "a shadow"],
  },
  {
    id: "extra-002",
    question: "I give light while slowly shrinking; blow on me and I go dark. What am I?",
    answers: ["candle", "a candle"],
  },
  {
    id: "extra-003",
    question: "I answer when you call, but only repeat what you said. What am I?",
    answers: ["echo", "an echo"],
  },
  {
    id: "extra-004",
    question: "I have a bed and a mouth, but I never sleep or eat. What am I?",
    answers: ["river", "a river"],
  },
  {
    id: "extra-005",
    question: "I have a spine and pages but no bones, and I can take you somewhere without moving. What am I?",
    answers: ["book", "a book"],
  },
  {
    id: "extra-006",
    question: "I travel folded in an envelope, carrying words from one person to another. What am I?",
    answers: ["letter", "a letter"],
  },
  {
    id: "extra-007",
    question: "I have steps, but I never take one myself. People climb me to change floors. What am I?",
    answers: ["stairs", "staircase"],
  },
  {
    id: "extra-008",
    question: "I have a space bar and an enter key, but neither opens a room. What am I?",
    answers: ["keyboard", "a keyboard"],
  },
  {
    id: "extra-009",
    question: "I have pages for every month, but I never tell a story. What am I?",
    answers: ["calendar", "a calendar"],
  },
  {
    id: "extra-010",
    question: "I open over your head when clouds begin to cry. What am I?",
    answers: ["umbrella", "an umbrella"],
  },
  {
    id: "extra-011",
    question: "I visit your mouth every day, but I never eat. What am I?",
    answers: ["toothbrush", "a toothbrush"],
  },
  {
    id: "extra-012",
    question: "I whistle when I boil, though I have no lips. What am I?",
    answers: ["kettle", "a kettle"],
  },
  {
    id: "extra-013",
    question: "I catch your head every night and hear your dreams without remembering them. What am I?",
    answers: ["pillow", "a pillow"],
  },
  {
    id: "extra-014",
    question: "I have a handle and travel often, but I never choose where to go. What am I?",
    answers: ["suitcase", "a suitcase"],
  },
  {
    id: "extra-015",
    question: "I stand by the sea and send a warning beam without speaking. What am I?",
    answers: ["lighthouse", "a lighthouse"],
  },
  {
    id: "extra-016",
    question: "I bring distant stars closer without taking a step. What am I?",
    answers: ["telescope", "a telescope"],
  },
  {
    id: "extra-017",
    question: "I show you your reflection but never keep it. What am I?",
    answers: ["mirror", "a mirror"],
  },
  {
    id: "extra-018",
    question: "I have teeth that mesh but never chew. What am I?",
    answers: ["zipper", "a zipper"],
  },
  {
    id: "extra-019",
    question: "I have fingers but no bones, and I keep a hand warm. What am I?",
    answers: ["glove", "a glove"],
  },
  {
    id: "extra-020",
    question: "I can fill a dark room and take up no space. What am I?",
    answers: ["light"],
  },
  {
    id: "extra-021",
    question: "I am full of holes but can hold water. What am I?",
    answers: ["sponge", "a sponge"],
  },
  {
    id: "extra-022",
    question: "I have branches but no leaves, and you can deposit money in me. What am I?",
    answers: ["bank", "a bank"],
  },
  {
    id: "extra-023",
    question: "I have a head and a tail but no body. What am I?",
    answers: ["coin", "a coin"],
  },
  {
    id: "extra-024",
    question: "I am always in front of you, but you can never see me. What am I?",
    answers: ["future", "the future"],
  },
  {
    id: "extra-025",
    question: "You can catch me but never toss me to someone else. What am I?",
    answers: ["cold", "a cold"],
  },
  {
    id: "extra-026",
    question: "I only go up, never down, every time you celebrate your birthday. What am I?",
    answers: ["age", "your age"],
  },
  {
    id: "extra-027",
    question: "The more steps you take, the more of me you leave behind. What am I?",
    answers: ["footprints", "footprint"],
  },
  {
    id: "extra-028",
    question: "I have rings that record my years, but no fingers. What am I?",
    answers: ["tree", "a tree"],
  },
  {
    id: "extra-029",
    question: "You can make, keep, or break me, but I have no physical shape. What am I?",
    answers: ["promise", "a promise"],
  },
  {
    id: "extra-030",
    question: "I am always coming, but when I arrive I have a different name. What am I?",
    answers: ["tomorrow"],
  },
  {
    id: "extra-031",
    question: "I have a collar and sleeves, but no neck or arms. What am I?",
    answers: ["shirt", "a shirt"],
  },
  {
    id: "extra-032",
    question: "I have thirteen hearts but no blood, and fifty-two faces to shuffle. What am I?",
    answers: ["deck of cards", "cards", "a deck of cards"],
  },
  {
    id: "extra-033",
    question: "I eat rubbish each morning, but I have no mouth. What am I?",
    answers: ["garbage truck", "rubbish truck", "bin lorry"],
  },
  {
    id: "extra-034",
    question: "I am a coat you cannot wear; I cover walls and dry on them. What am I?",
    answers: ["paint", "a coat of paint"],
  },
  {
    id: "extra-035",
    question: "I can be ice, liquid, or steam, yet I am still the same substance. What am I?",
    answers: ["water"],
  },
  {
    id: "extra-036",
    question: "What word is always written incorrectly?",
    answers: ["incorrectly"],
  },
  {
    id: "extra-037",
    question: "I have a tongue and a sole, but I cannot speak or feel. What am I?",
    answers: ["shoe", "a shoe"],
  },
  {
    id: "extra-038",
    question: "I start crawling on four, walk on two, then use a cane as a third. What am I?",
    answers: ["person", "human", "human being"],
  },
  {
    id: "extra-039",
    question: "What can you hold with your left hand but not your right?",
    answers: ["right elbow", "your right elbow"],
  },
  {
    id: "extra-040",
    question: "I have a headboard and footboard but no head or feet. What am I?",
    answers: ["bed", "a bed"],
  },
  {
    id: "extra-041",
    question: "The more earth you take from me, the bigger I get. What am I?",
    answers: ["hole", "a hole"],
  },
  {
    id: "extra-042",
    question: "I can be cracked, made, told, and played, but I am not an egg. What am I?",
    answers: ["joke", "a joke"],
  },
  {
    id: "extra-043",
    question: "I have a ring and let two people talk from far apart. What am I?",
    answers: ["telephone", "phone", "a telephone"],
  },
  {
    id: "extra-044",
    question: "I have two wheels, pedals, and a bell, but need someone to set me moving. What am I?",
    answers: ["bicycle", "bike", "a bicycle"],
  },
  {
    id: "extra-045",
    question: "I have a heart that never beats, protected by layers of leaves. What am I?",
    answers: ["artichoke", "an artichoke"],
  },
  {
    id: "extra-046",
    question: "I am a room you can eat, growing under the trees. What am I?",
    answers: ["mushroom", "a mushroom"],
  },
  {
    id: "extra-047",
    question: "I have many eyes but cannot see; you peel me before cooking. What am I?",
    answers: ["potato", "a potato"],
  },
  {
    id: "extra-048",
    question: "I have four legs and a flat top, but I never walk or wear a hat. What am I?",
    answers: ["table", "a table"],
  },
  {
    id: "extra-049",
    question: "I can be saved, spent, wasted, and measured, but never held. What am I?",
    answers: ["time"],
  },
  {
    id: "extra-050",
    question: "I drift down from a bird but have no wings of my own. What am I?",
    answers: ["feather", "a feather"],
  },
  {
    id: "extra-051",
    question: "I go around forever with no corners and no end. What am I?",
    answers: ["circle", "a circle"],
  },
  {
    id: "extra-052",
    question: "I shave faces all day, yet may grow a beard myself. Who am I?",
    answers: ["barber", "a barber"],
  },
  {
    id: "extra-053",
    question: "I have teeth and bite into wood, but I never eat. What am I?",
    answers: ["saw", "a saw"],
  },
  {
    id: "extra-054",
    question: "I grow without being planted and can be clipped without pain. What am I?",
    answers: ["fingernails", "nails"],
  },
  {
    id: "extra-055",
    question: "What becomes broken the moment you speak?",
    answers: ["silence"],
  },
  {
    id: "extra-056",
    question: "I fall from clouds, cover the ground, and vanish in warmth. What am I?",
    answers: ["snow"],
  },
  {
    id: "extra-057",
    question: "Feed me and I grow; give me water and I die. What am I?",
    answers: ["fire"],
  },
  {
    id: "extra-058",
    question: "I am solid water; warm me and I disappear into a puddle. What am I?",
    answers: ["ice"],
  },
  {
    id: "extra-059",
    question: "I have a cream on top and a skin when heated, but no body. What am I?",
    answers: ["milk"],
  },
  {
    id: "extra-060",
    question: "I can surround a garden without taking a single step. What am I?",
    answers: ["fence", "a fence"],
  },
  {
    id: "extra-061",
    question: "I have teeth but cannot bite, and I can turn a lock. What am I?",
    answers: ["key", "a key"],
  },
  {
    id: "extra-062",
    question: "I have a handle and a frame, and I can stand between two rooms. What am I?",
    answers: ["door", "a door"],
  },
  {
    id: "extra-063",
    question: "I have panes and a frame, let light pass, but never see the view. What am I?",
    answers: ["window", "a window"],
  },
  {
    id: "extra-064",
    question: "I have wings and a tail but am not alive; I carry people above the clouds. What am I?",
    answers: ["airplane", "aeroplane", "plane"],
  },
  {
    id: "extra-065",
    question: "I have six strings but no shoelaces, and I can sing when plucked. What am I?",
    answers: ["guitar", "a guitar"],
  },
  {
    id: "extra-066",
    question: "I have a skin and can be beaten, but I never get hurt. What am I?",
    answers: ["drum", "a drum"],
  },
  {
    id: "extra-067",
    question: "I write on a blackboard and grow smaller every time I work. What am I?",
    answers: ["chalk"],
  },
  {
    id: "extra-068",
    question: "I remove pencil marks by slowly wearing myself away. What am I?",
    answers: ["eraser", "rubber"],
  },
  {
    id: "extra-069",
    question: "I have a point and lead but cannot write on my own. What am I?",
    answers: ["pencil", "a pencil"],
  },
  {
    id: "extra-070",
    question: "I have inches and centimetres but no legs to stand on. What am I?",
    answers: ["ruler", "a ruler"],
  },
  {
    id: "extra-071",
    question: "I have two blades and a pair of handles, but never cut my own hair. What am I?",
    answers: ["scissors"],
  },
  {
    id: "extra-072",
    question: "I have headlines, columns, and pages, but no voice of my own. What am I?",
    answers: ["newspaper", "a newspaper"],
  },
  {
    id: "extra-073",
    question: "I swallow letters and postcards but never read a word. What am I?",
    answers: ["postbox", "post box", "mailbox", "mail box"],
  },
  {
    id: "extra-074",
    question: "I carry cards and cash in pockets, but I have no clothes. What am I?",
    answers: ["wallet", "a wallet"],
  },
  {
    id: "extra-075",
    question: "I keep food cool and open my door many times, but I never eat. What am I?",
    answers: ["refrigerator", "fridge"],
  },
  {
    id: "extra-076",
    question: "I heat food with invisible waves but have no flame. What am I?",
    answers: ["microwave", "microwave oven"],
  },
  {
    id: "extra-077",
    question: "I brown bread and pop it up, but I never eat breakfast. What am I?",
    answers: ["toaster", "a toaster"],
  },
  {
    id: "extra-078",
    question: "I spin clothes around but never get dizzy. What am I?",
    answers: ["washing machine", "washer"],
  },
  {
    id: "extra-079",
    question: "I have two clear chambers and sand that runs from one to the other. What am I?",
    answers: ["hourglass", "an hourglass", "sand timer"],
  },
  {
    id: "extra-080",
    question: "I have a needle that points north, but I never sew. What am I?",
    answers: ["compass", "a compass"],
  },
  {
    id: "extra-081",
    question: "I attract iron without touching it, but I cannot make a promise. What am I?",
    answers: ["magnet", "a magnet"],
  },
  {
    id: "extra-082",
    question: "I store energy and can run out, but I never get tired. What am I?",
    answers: ["battery", "a battery"],
  },
  {
    id: "extra-083",
    question: "I feed a phone electricity but do not use a plate. What am I?",
    answers: ["charger", "a charger"],
  },
  {
    id: "extra-084",
    question: "I have a lens that captures a moment and a flash that lights it, but no eyes. What am I?",
    answers: ["camera", "a camera"],
  },
  {
    id: "extra-085",
    question: "I freeze a moment in time, even though nothing in me can move. What am I?",
    answers: ["photograph", "photo", "picture"],
  },
  {
    id: "extra-086",
    question: "I have no ears, but I pick up voices and send them onward. What am I?",
    answers: ["microphone", "a microphone"],
  },
  {
    id: "extra-087",
    question: "I have no mouth, yet I can make music and words loud. What am I?",
    answers: ["speaker", "loudspeaker"],
  },
  {
    id: "extra-088",
    question: "I cover your ears and bring sound close without speaking. What am I?",
    answers: ["headphones", "headphone"],
  },
  {
    id: "extra-089",
    question: "I wear dark lenses but have no eyes. What am I?",
    answers: ["sunglasses", "sun glasses"],
  },
  {
    id: "extra-090",
    question: "I have a brim or a crown but no king. What am I?",
    answers: ["hat", "a hat"],
  },
  {
    id: "extra-091",
    question: "I am small and round, and keep a shirt closed without a key. What am I?",
    answers: ["button", "a button"],
  },
  {
    id: "extra-092",
    question: "I have rungs but no legs, and help you reach high places. What am I?",
    answers: ["ladder", "a ladder"],
  },
  {
    id: "extra-093",
    question: "I travel between floors but never leave the building. What am I?",
    answers: ["elevator", "lift"],
  },
  {
    id: "extra-094",
    question: "I connect two banks but never keep money. What am I?",
    answers: ["bridge", "a bridge"],
  },
  {
    id: "extra-095",
    question: "I go through a hill and have no door at either end. What am I?",
    answers: ["tunnel", "a tunnel"],
  },
  {
    id: "extra-096",
    question: "I have three eyes; red says stop and green says go, but I never see. What am I?",
    answers: ["traffic light", "traffic signal"],
  },
  {
    id: "extra-097",
    question: "I point the way with an arm but have no hand. What am I?",
    answers: ["signpost", "sign post"],
  },
  {
    id: "extra-098",
    question: "I am a tiny eye in a door that lets a key peek inside. What am I?",
    answers: ["keyhole", "key hole"],
  },
  {
    id: "extra-099",
    question: "I have a keyhole and keep a door closed without hands. What am I?",
    answers: ["lock", "a lock"],
  },
  {
    id: "extra-100",
    question: "I protect valuables with a combination but never feel safe. What am I?",
    answers: ["safe", "a safe"],
  },
];

export function getGroupRiddleById(id: string): Riddle | null {
  return GROUP_RIDDLES.find((riddle) => riddle.id === id) ?? null;
}

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
    restore(
      chatId: number,
      messageId: number,
      riddle: Riddle,
      expiresAt: number,
      now = Date.now(),
    ): boolean {
      if (!Number.isSafeInteger(chatId) || chatId === 0) return false;
      if (!Number.isSafeInteger(messageId) || messageId <= 0) return false;
      if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) return false;
      if (getActive(chatId, now)) return false;
      active.set(chatId, { messageId, riddle, expiresAt });
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

const WRONG_RIDDLE_ANSWER_RESPONSES = [
  "Nexttttt! Who's got it?",
  "Not quite. Anyone else?",
  "Nope! The riddle is still undefeated.",
  "Ooh, not quite! Who's got another guess?",
] as const;

export function chooseWrongRiddleAnswerResponse(random = Math.random): string {
  const index = Math.min(
    Math.max(0, Math.floor(random() * WRONG_RIDDLE_ANSWER_RESPONSES.length)),
    WRONG_RIDDLE_ANSWER_RESPONSES.length - 1,
  );
  return WRONG_RIDDLE_ANSWER_RESPONSES[index];
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

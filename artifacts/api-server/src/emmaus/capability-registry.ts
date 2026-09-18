/**
 * Server-owned description of what Emmaus actually provides.
 *
 * This is intentionally application metadata, not model knowledge. Every
 * location below is a route already registered by the member application.
 * Models may describe these capabilities only through this registry.
 */

export type EmmausCapabilityId =
  | "todays-steps"
  | "my-bible"
  | "daily-devotional"
  | "daily-rhythm"
  | "sermons"
  | "bible-studies"
  | "walks"
  | "journeys"
  | "discover"
  | "my-journey"
  | "saved-bible-position"
  | "active-progress"
  | "ask-emmaus";

export type EmmausCapabilityOperation =
  | "DESCRIBE"
  | "OPEN"
  | "READ"
  | "CONTINUE"
  | "FIND";

export interface EmmausCapability {
  id: EmmausCapabilityId;
  displayName: string;
  aliases: readonly string[];
  description: string;
  location: string;
  route: string;
  supportedOperations: readonly EmmausCapabilityOperation[];
  requiredAuthentication: "authenticated" | "public";
  scope: "global" | "user";
  resolver: string;
}

export const EMMAUS_CAPABILITIES: readonly EmmausCapability[] = [
  {
    id: "todays-steps",
    displayName: "My Emmaus",
    aliases: ["today's steps", "todays steps", "today", "home", "walk home"],
    description: "Your Walk home, where Emmaus shows the steps available to you today.",
    location: "The Walk tab",
    route: "/walk",
    supportedOperations: ["DESCRIBE", "OPEN", "CONTINUE"],
    requiredAuthentication: "authenticated",
    scope: "user",
    resolver: "getTodaysSteps",
  },
  {
    id: "my-bible",
    displayName: "My Bible",
    aliases: ["my bible", "the bible", "bible", "scripture"],
    description: "The Bible reader with books, chapters, saved position, notes, highlights and study help.",
    location: "The My Bible tab",
    route: "/bible",
    supportedOperations: ["DESCRIBE", "OPEN", "READ", "CONTINUE"],
    requiredAuthentication: "authenticated",
    scope: "user",
    resolver: "getBibleData",
  },
  {
    id: "daily-devotional",
    displayName: "Daily Devotional",
    aliases: ["daily devotional", "daily devotionals", "devotional", "devotionals", "my devotional", "today's devotion", "today's devotional"],
    description: "Self-paced devotional series available from the Daily Devotionals section of your Walk.",
    location: "The Daily Devotionals section on Walk; Discover can show more series.",
    route: "/journeys?tab=devotionals",
    supportedOperations: ["DESCRIBE", "OPEN", "READ", "CONTINUE", "FIND"],
    requiredAuthentication: "authenticated",
    scope: "user",
    resolver: "getTodaysDevotional",
  },
  {
    id: "daily-rhythm",
    displayName: "Daily Rhythm",
    aliases: ["daily rhythm", "rhythm", "daily reading", "today's rhythm", "today's daily rhythm"],
    description: "Your Walk home, where Emmaus shows the steps available to you today.",
    location: "My Emmaus on Walk",
    route: "/daily-rhythm/navigate",
    supportedOperations: ["DESCRIBE", "OPEN", "READ", "CONTINUE"],
    requiredAuthentication: "authenticated",
    scope: "user",
    resolver: "getEligibleDailyRhythm",
  },
  {
    id: "sermons",
    displayName: "Sermons",
    aliases: ["sermons", "sermon", "preaching", "preached"],
    description: "Published ICC sermons, with verified links and timestamps where available.",
    location: "Discover, in the Sermons section",
    route: "/journeys?tab=sermons",
    supportedOperations: ["DESCRIBE", "OPEN", "FIND"],
    requiredAuthentication: "authenticated",
    scope: "global",
    resolver: "findSermons",
  },
  {
    id: "bible-studies",
    displayName: "Bible Studies",
    aliases: ["bible studies", "bible study", "study notes", "study"],
    description: "Published Bible Study notes and guided studies connected to Scripture.",
    location: "Discover, in the Bible Studies section",
    route: "/journeys?tab=bible-studies",
    supportedOperations: ["DESCRIBE", "OPEN", "FIND"],
    requiredAuthentication: "authenticated",
    scope: "global",
    resolver: "findBibleStudies",
  },
  {
    id: "walks",
    displayName: "Walks",
    aliases: ["walks", "walk", "a walk"],
    description: "Shorter guided discipleship journeys that help you take one step at a time.",
    location: "Walk and Discover",
    route: "/journeys?tab=walks",
    supportedOperations: ["DESCRIBE", "OPEN", "CONTINUE", "FIND"],
    requiredAuthentication: "authenticated",
    scope: "user",
    resolver: "findWalks",
  },
  {
    id: "journeys",
    displayName: "Journeys",
    aliases: ["journeys", "journey", "a journey"],
    description: "Longer guided paths through Scripture and discipleship.",
    location: "The Journeys area and Discover",
    route: "/journeys?tab=journeys",
    supportedOperations: ["DESCRIBE", "OPEN", "CONTINUE", "FIND"],
    requiredAuthentication: "authenticated",
    scope: "user",
    resolver: "findJourneys",
  },
  {
    id: "discover",
    displayName: "Discover",
    aliases: ["discover", "explore", "find content"],
    description: "The place to browse published Walks, Journeys, devotionals and sermons.",
    location: "The Discover tab",
    route: "/journeys",
    supportedOperations: ["DESCRIBE", "OPEN", "FIND"],
    requiredAuthentication: "authenticated",
    scope: "global",
    resolver: "buildEmmausResourceCatalogue",
  },
  {
    id: "my-journey",
    displayName: "My Journey",
    aliases: ["my journey", "my progress", "my walks", "my content"],
    description: "Your active content and progress, surfaced from your Walk home.",
    location: "The Walk tab",
    route: "/walk",
    supportedOperations: ["DESCRIBE", "OPEN", "CONTINUE"],
    requiredAuthentication: "authenticated",
    scope: "user",
    resolver: "getActiveProgress",
  },
  {
    id: "saved-bible-position",
    displayName: "Saved Bible position",
    aliases: ["saved bible position", "where i left off", "where i stopped reading", "continue reading my bible", "carry on from where i stopped reading"],
    description: "The last Bible chapter you opened, saved to your signed-in account.",
    location: "My Bible",
    route: "/bible",
    supportedOperations: ["DESCRIBE", "CONTINUE"],
    requiredAuthentication: "authenticated",
    scope: "user",
    resolver: "getSavedBiblePosition",
  },
  {
    id: "active-progress",
    displayName: "Active Walk and Journey progress",
    aliases: ["active progress", "progress through my journey", "progress through my walk", "what journey am i busy with", "what walk am i busy with"],
    description: "Your server-saved position in active Walks and Journeys.",
    location: "The Walk tab",
    route: "/walk",
    supportedOperations: ["DESCRIBE", "CONTINUE"],
    requiredAuthentication: "authenticated",
    scope: "user",
    resolver: "getActiveProgress",
  },
  {
    id: "ask-emmaus",
    displayName: "Ask Emmaus",
    aliases: ["ask emmaus", "emmaus", "this assistant"],
    description: "A Scripture-first assistant that can explain the Bible and help you find verified Emmaus content.",
    location: "The Ask Emmaus area in Personal",
    route: "/personal/ask-emmaus",
    supportedOperations: ["DESCRIBE", "OPEN"],
    requiredAuthentication: "authenticated",
    scope: "user",
    resolver: "handleConversation",
  },
] as const;

const normalized = (value: string) => value.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();

export function getEmmausCapability(id: EmmausCapabilityId): EmmausCapability {
  return EMMAUS_CAPABILITIES.find((capability) => capability.id === id) ?? EMMAUS_CAPABILITIES[0];
}

export function findEmmausCapability(input: string): EmmausCapability | null {
  const value = normalized(input);
  if (!value) return null;

  const matches = EMMAUS_CAPABILITIES
    .flatMap((capability) => [
      { capability, phrase: normalized(capability.displayName) },
      ...capability.aliases.map((alias) => ({ capability, phrase: normalized(alias) })),
    ])
    .filter(({ phrase }) => value === phrase || value.includes(phrase))
    .sort((a, b) => b.phrase.length - a.phrase.length);

  return matches[0]?.capability ?? null;
}

export function describeCapability(capability: EmmausCapability): string {
  return `${capability.displayName}: ${capability.description} You can find it in ${capability.location}.`;
}
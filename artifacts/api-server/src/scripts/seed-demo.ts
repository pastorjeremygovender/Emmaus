/**
 * seed-demo.ts — Insert demo/sample journey content for development and staging.
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  PRODUCTION SAFETY GUARD                                                ║
 * ║  This script will NOT run in production unless                          ║
 * ║  ALLOW_SEED_IN_PRODUCTION=true is explicitly set.                       ║
 * ║                                                                          ║
 * ║  It NEVER deletes existing records.                                      ║
 * ║  All inserts skip records that already exist.                            ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Run from the api-server directory:
 *   pnpm seed:demo
 *   # or:
 *   tsx src/scripts/seed-demo.ts
 *
 * Idempotent — safe to run multiple times.
 */

const isProd = process.env.NODE_ENV === "production";
const allowProd = process.env.ALLOW_SEED_IN_PRODUCTION === "true";

if (isProd && !allowProd) {
  console.error(
    "\n[seed-demo] BLOCKED: NODE_ENV=production detected.\n" +
    "  This script inserts demo/sample content and must not run in production.\n" +
    "  To run intentionally on production data, set:\n" +
    "    ALLOW_SEED_IN_PRODUCTION=true tsx src/scripts/seed-demo.ts\n"
  );
  process.exit(1);
}

if (isProd && allowProd) {
  console.warn(
    "\n[seed-demo] WARNING: Running against production with ALLOW_SEED_IN_PRODUCTION=true.\n" +
    "  No existing records will be modified.\n"
  );
}

import { db } from "@workspace/db";
import { journeysTable, journeyStepsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

const JOURNEYS = [
  {
    id: "15-minutes-with-jesus",
    title: "10 Minutes with Jesus",
    subtitle: "A daily encounter with the living God",
    description: "A simple daily rhythm to help you spend time with Jesus every day.",
    journeyType: "daily-rhythm",
    category: "Devotional",
    difficulty: "Beginner",
    estimatedDuration: "10 min/day",
    tags: ["daily", "jesus", "beginner", "daily-rhythm", "15-minutes-with-jesus"],
    durationDays: 7,
    status: "Published",
    xpReward: 70,
  },
  {
    id: "gods-kindness-restores-the-broken",
    title: "God's Kindness Restores the Broken",
    subtitle: "5 weekday devotionals from Sunday's sermon",
    description: "5 short weekday devotionals based on Sunday's sermon.",
    journeyType: "companion",
    category: "Companion",
    difficulty: "Beginner",
    estimatedDuration: "10 min/day",
    tags: ["kindness", "healing", "companion", "sermon"],
    durationDays: 5,
    status: "Published",
    xpReward: 50,
  },
];

type StepData = {
  journeyId: string;
  day: number;
  title: string;
  mentorIntro: string;
  scripture: string;
  teachingContent: string;
  reflectionQuestion: string;
  prayer: string;
  todaysAction: string;
  suggestedSermons?: Array<{ timestamp?: number; link?: string; contextualSentence?: string }>;
};

const STEPS: StepData[] = [
  // ── 10 Minutes with Jesus ──────────────────────────────────────────────────
  {
    journeyId: "15-minutes-with-jesus", day: 1, title: "Jesus Meets You Here",
    mentorIntro: "Wherever you are right now — in the middle of a busy week or a quiet moment — Jesus is already here.",
    scripture: "John 1:14",
    teachingContent: "We often think we need to arrive at a certain place before Jesus shows up. But the good news of the Incarnation is that God came to us — into our ordinary world, with all its noise and mess. He didn't wait for us to have it together. He simply came.",
    reflectionQuestion: "Where do you sense Jesus showing up in your ordinary life right now?",
    prayer: "Lord Jesus, thank you that you came to be with us. Help me to notice your presence in my everyday moments today.",
    todaysAction: "Take two minutes to sit quietly before you begin your day. Simply say: 'Jesus, you are here.'",
  },
  {
    journeyId: "15-minutes-with-jesus", day: 2, title: "You Are Not Alone",
    mentorIntro: "One of the most powerful promises in Scripture is simply this: you are not alone.",
    scripture: "Matthew 28:20",
    teachingContent: "Loneliness is one of the deepest human aches. We were made for connection — with God and with each other. The risen Jesus doesn't leave his people to figure things out on their own. His final words to his disciples weren't instructions or warnings. They were a promise: I am with you.",
    reflectionQuestion: "When do you feel most alone? How does the promise of Jesus' presence speak to that?",
    prayer: "Jesus, in the moments when I feel most isolated, remind me that you are with me. Teach me to lean into your presence.",
    todaysAction: "Reach out to one person today — a text, a call, or a simple note — and let them know you were thinking of them.",
  },
  {
    journeyId: "15-minutes-with-jesus", day: 3, title: "Learning to Trust",
    mentorIntro: "Trust is something we build slowly, through small acts of surrender.",
    scripture: "Proverbs 3:5–6",
    teachingContent: "We are wired to figure things out ourselves. But trusting God means bringing our plans and worries to him — not as a last resort, but as a first instinct. It's a practice, not a one-time event.",
    reflectionQuestion: "What is one area of your life where you find it hardest to trust God? Why?",
    prayer: "Lord, where I am holding on tightly out of fear, help me to open my hands. I choose to trust you.",
    todaysAction: "Write down one worry or uncertainty. Consciously hand it over to God — you could even tear the paper up as an act of surrender.",
  },
  {
    journeyId: "15-minutes-with-jesus", day: 4, title: "The Friend of Sinners",
    mentorIntro: "Jesus was called a friend of sinners — and he wore it as a badge of honour.",
    scripture: "Luke 15:1–2",
    teachingContent: "The religious leaders said it as an insult: 'This man welcomes sinners and eats with them.' But Jesus embraced it. He sought out the ones who knew they needed help, not those who thought they had it together. This is still his posture toward us.",
    reflectionQuestion: "How does it change your view of God to know that Jesus intentionally sought out people who were broken?",
    prayer: "Jesus, thank you that you came for people like me. Help me to stop hiding and come to you just as I am.",
    todaysAction: "Is there something you've been ashamed to bring to God? Today, bring it. He already knows, and he's already reaching toward you.",
  },
  {
    journeyId: "15-minutes-with-jesus", day: 5, title: "Learning to Be Still",
    mentorIntro: "In a noisy world, silence can feel like a foreign language. But it's the language Jesus often spoke.",
    scripture: "Mark 1:35",
    teachingContent: "Even Jesus withdrew from the crowds to pray. He didn't fill every moment with activity. He made space for the Father. Stillness isn't laziness — it's resistance against a culture that equates busyness with worth.",
    reflectionQuestion: "What does it feel like when you stop? What does the silence surface in you?",
    prayer: "Father, help me to be still — not just in body, but in spirit. Quieten the noise inside me so I can hear you.",
    todaysAction: "Set a five-minute timer. No phone, no music. Simply sit and breathe. Let it be awkward. Stay anyway.",
  },
  {
    journeyId: "15-minutes-with-jesus", day: 6, title: "Known and Loved",
    mentorIntro: "There is a difference between being known and being understood. Jesus offers something deeper than understanding — he offers full knowledge, and still chooses love.",
    scripture: "John 10:14",
    teachingContent: "The shepherd knows his sheep by name. He doesn't know them as a category or a group — he knows them individually. Jesus knows your name, your history, your fears, the parts of you that you've never shown anyone. And his response to that full knowledge is not rejection. It is love.",
    reflectionQuestion: "Is there a part of you that you fear God might reject if he truly knew it? What would it mean to bring that to him today?",
    prayer: "Lord Jesus, you know me fully. Help me to trust that your love is not conditional on me being better. I receive your knowledge and your love.",
    todaysAction: "Write one sentence completing this: 'The part of me I find hardest to believe God loves is...' Then write: 'But he does.'",
  },
  {
    journeyId: "15-minutes-with-jesus", day: 7, title: "Walking On From Here",
    mentorIntro: "Seven days ago you started a conversation. Today is not an ending — it's an invitation to keep going.",
    scripture: "John 21:19",
    teachingContent: "Jesus' final word to Peter — after failure, shame, and restoration — was simply: 'Follow me.' Not 'fix yourself first.' Not 'prove yourself.' Just follow. That's the whole invitation. It starts again today.",
    reflectionQuestion: "What is one thing from this week that you want to carry forward into daily life?",
    prayer: "Lord Jesus, thank you for these seven days. Walk with me into what comes next. I choose to follow.",
    todaysAction: "Choose one practice from this week that felt most alive — and commit to doing it once more this week.",
  },

  // ── God's Kindness Restores the Broken ────────────────────────────────────
  {
    journeyId: "gods-kindness-restores-the-broken", day: 1, title: "A Kingdom That Forgets No One",
    mentorIntro: "The most remarkable thing about kindness is that it chooses people who aren't expecting it.",
    scripture: "2 Samuel 9:1",
    teachingContent: "David could have ignored Mephibosheth — most kings would have. Instead he asked: 'Is there anyone left from the house of Saul to whom I can show kindness for Jonathan's sake?' The question itself is remarkable. It's driven by love for someone absent, and directed toward someone forgotten.",
    reflectionQuestion: "Is there someone in your life who has been forgotten by others — who might need to be found?",
    prayer: "Lord, give me eyes to see the people who feel invisible or forgotten. Show me how to extend your kindness.",
    todaysAction: "Think of one person who might feel overlooked this week. Do one small thing to remind them they are seen.",
  },
  {
    journeyId: "gods-kindness-restores-the-broken", day: 2, title: "Don't Let Your Past Define Your Future",
    mentorIntro: "Mephibosheth had lived in Lo Debar — a place whose name means 'nothing.' But his story was about to change.",
    scripture: "2 Samuel 9:4–5",
    teachingContent: "Mephibosheth had grown up in a place of shame and obscurity. He had every reason to believe that was where his story ended. But the king sent for him. God is always sending for people who believe their story ended in Lo Debar.",
    reflectionQuestion: "What is your 'Lo Debar' — the place or moment you've believed defined you permanently?",
    prayer: "Father, I give you the Lo Debar seasons of my life. I choose to believe that you are sending for me, that my story is not over.",
    todaysAction: "Write down one old narrative you've been carrying that no longer needs to define you. Then write: 'This is not the end of my story.'",
  },
  {
    journeyId: "gods-kindness-restores-the-broken", day: 3, title: "Grace Doesn't Wait for You to Deserve It",
    mentorIntro: "When Mephibosheth came before David, he bowed and called himself a 'dead dog.' David's response was the opposite of what he expected.",
    scripture: "2 Samuel 9:7",
    teachingContent: "Mephibosheth came expecting judgement. He got restoration. David gave him land, servants, and a seat at the royal table — not because Mephibosheth earned it, but because David had made a covenant with Jonathan. God's kindness to us works the same way. It's covenant love, not reward.",
    reflectionQuestion: "Where in your life have you been waiting to be 'good enough' before receiving God's grace?",
    prayer: "Lord, I confess that I often approach you as though I need to deserve your love. Help me to receive what you freely give.",
    todaysAction: "Do something kind for yourself today — something you've been withholding because you didn't feel you deserved it.",
  },
  {
    journeyId: "gods-kindness-restores-the-broken", day: 4, title: "There Is a Place for You at the Table",
    mentorIntro: "The most stunning detail in the story is this: David didn't just help Mephibosheth — he gave him a seat at his own table.",
    scripture: "2 Samuel 9:13",
    teachingContent: "Every day, Mephibosheth ate at the king's table. He was treated not as a charity case, but as a son. This is exactly what God does with us — he seats us at his table, covers our shame, and calls us family.",
    reflectionQuestion: "How do you respond to the idea that God wants you at his table — not just in his service?",
    prayer: "Lord, help me to take my seat at your table. Where I have believed I am only worthy to serve and not to belong, speak your truth.",
    todaysAction: "Share a meal with someone today — or invite someone to share one with you. Let it be a small act of the table fellowship God models.",
    suggestedSermons: [{ timestamp: 1980, link: "https://www.youtube.com/watch?v=PLACEHOLDER_VIDEO_ID&t=1980s", contextualSentence: "This moment connects directly with today's reflection on the table." }],
  },
  {
    journeyId: "gods-kindness-restores-the-broken", day: 5, title: "Live as Someone Who Has Been Restored",
    mentorIntro: "The story ends not with Mephibosheth leaving the table — but with him staying. The restored life is meant to be our new normal.",
    scripture: "2 Samuel 9:11",
    teachingContent: "Mephibosheth could have gone back to Lo Debar. But he stayed. He lived as someone who had been restored. This is the invitation for all of us — not just to receive grace once, but to inhabit it daily.",
    reflectionQuestion: "What would it look like for you to 'live at the table' — to make your daily life an expression of someone who has been fully restored?",
    prayer: "Lord, help me to stop going back to Lo Debar. Teach me to live as someone who belongs at your table — every ordinary day.",
    todaysAction: "Write a short statement about who you are in Christ — not what you do, but who you are. Read it aloud. Keep it somewhere visible this week.",
    suggestedSermons: [{ timestamp: 2344, link: "https://www.youtube.com/watch?v=PLACEHOLDER_VIDEO_ID&t=2344s", contextualSentence: "Pastor Jeremy speaks directly to what it means to live in restoration." }],
  },
];

async function seed() {
  console.log("\n[seed-demo] Starting demo content seed…");

  for (const j of JOURNEYS) {
    const existing = await db.select().from(journeysTable).where(eq(journeysTable.id, j.id));
    if (existing.length > 0) {
      console.log(`  [seed-demo] (skip) Journey '${j.id}' already exists`);
      continue;
    }
    const now = new Date();
    await db.insert(journeysTable).values({
      ...j,
      tags: j.tags ?? [],
      prerequisites: [],
      metadata: {},
      publishedAt: j.status === "Published" ? now : null,
      createdAt: now,
      updatedAt: now,
    });
    console.log(`  [seed-demo] Inserted journey: ${j.id}`);
  }

  for (const s of STEPS) {
    const existing = await db
      .select()
      .from(journeyStepsTable)
      .where(and(
        eq(journeyStepsTable.journeyId, s.journeyId),
        eq(journeyStepsTable.day, s.day),
      ));
    if (existing.length > 0) {
      console.log(`  [seed-demo] (skip) Step ${s.journeyId} day ${s.day} already exists`);
      continue;
    }
    const now = new Date();
    await db.insert(journeyStepsTable).values({
      journeyId: s.journeyId,
      day: s.day,
      title: s.title,
      mentorIntro: s.mentorIntro,
      scripture: s.scripture,
      teachingContent: s.teachingContent,
      reflectionQuestion: s.reflectionQuestion,
      prayer: s.prayer,
      todaysAction: s.todaysAction,
      suggestedSermons: s.suggestedSermons ?? [],
      suggestedFollowUpQuestions: [],
      scriptureReferences: [],
      content: {},
      status: "draft",
      createdAt: now,
      updatedAt: now,
    });
    console.log(`  [seed-demo] Inserted step: ${s.journeyId} day ${s.day}`);
  }

  console.log("[seed-demo] Done.\n");
  process.exit(0);
}

seed().catch(err => {
  console.error("[seed-demo] Fatal error:", err);
  process.exit(1);
});

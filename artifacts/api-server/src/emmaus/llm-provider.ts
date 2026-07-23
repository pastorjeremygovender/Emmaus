/**
 * Emmaus LLM Provider Interface
 *
 * Defines a provider-agnostic interface for streaming LLM completions.
 * Two implementations:
 *   - OpenAIProvider  → uses OPENAI_API_KEY; model: gpt-4o
 *   - MockProvider    → deterministic canned responses, works with no env vars
 *
 * The factory `createLLMProvider()` selects the correct one at startup.
 *
 * Required env vars for OpenAI mode:
 *   OPENAI_API_KEY
 *
 * When absent, MockProvider is used — all features remain functional.
 */

import OpenAI from "openai";

// ─── Interface ────────────────────────────────────────────────────────────────

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface StreamChunk {
  content: string;
  done: boolean;
}

export interface LLMProvider {
  /**
   * Stream a completion. Yields text chunks as they arrive.
   * The final chunk has done=true and may have empty content.
   */
  streamCompletion(
    messages: LLMMessage[],
    opts?: { maxTokens?: number }
  ): AsyncGenerator<StreamChunk>;
}

// ─── OpenAI Implementation ────────────────────────────────────────────────────

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async *streamCompletion(
    messages: LLMMessage[],
    opts: { maxTokens?: number } = {}
  ): AsyncGenerator<StreamChunk> {
    const stream = await this.client.chat.completions.create({
      model: "gpt-4o",
      messages,
      stream: true,
      max_tokens: opts.maxTokens ?? 2000,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content ?? "";
      const done = chunk.choices[0]?.finish_reason != null;
      if (content) yield { content, done: false };
      if (done) yield { content: "", done: true };
    }
  }
}

// ─── Mock Implementation ──────────────────────────────────────────────────────

/**
 * Classifies the user's message to pick the right canned response.
 *
 * Order matters — more specific intents must be checked first to prevent
 * broad alternates (like a bare "why") from stealing matches.
 * Order: name_identity → greeting → bible_understanding → personal_struggle
 *        → practical_discipleship → resource_discovery → theological → unknown
 */
function classifyMessage(message: string): keyof typeof MOCK_RESPONSES {
  const lc = message.toLowerCase();

  // 1. Name / identity — must come before biblical and theological checks
  //    so "Why is it called Emmaus?" doesn't fall into theological.
  if (/emmaus|luke 24|road to emmaus|emmaus road/.test(lc)) {
    return "name_identity";
  }

  // 2. Bare greetings — short messages that are just salutations
  if (/^(hi|hello|hey)\b/.test(lc.trim())) {
    return "greeting";
  }

  // 3. Bible understanding
  if (/john|chapter|verse|bible|passage|scripture|understand|explain/.test(lc)) {
    return "bible_understanding";
  }

  // 4. Personal struggle — require faith-distance or emotional-distress language;
  //    avoid "feel" and "lost" alone which catch too many unrelated questions.
  if (/far from god|god feels distant|distant from god|feel close to god|feel god|lonely|alone|depressed|anxious|afraid|sad|doubt|struggle/.test(lc)) {
    return "personal_struggle";
  }

  // 5. Practical discipleship
  if (/pray|prayer|how do i|quiet time|devotion|read the bible|discipline/.test(lc)) {
    return "practical_discipleship";
  }

  // 6. Resource discovery
  if (/journey|sermon|room|community|group|where do i start|recommend|suggest/.test(lc)) {
    return "resource_discovery";
  }

  // 7. Theological / forgiveness — use specific forgiveness language rather than
  //    a bare "why" which matches almost everything.
  if (/forgiv|bitter|resent|how do i forgive|ephesians 4|god allow|suffering|evil|grace|salvation|heaven|hell|sin/.test(lc)) {
    return "theological";
  }

  // 8. Unknown — honest dev-provider fallback
  return "unknown";
}

const MOCK_RESPONSES = {
  name_identity: `The name comes from a road.

In Luke 24, two disciples were walking from Jerusalem to a village called Emmaus — seven miles, heads down, conversation heavy. Everything they had hoped for had collapsed. Then a stranger came alongside them and walked with them. He listened. He opened the Scriptures. He explained what the prophets had said, and their hearts burned within them as he spoke.

They did not recognise him until he sat at their table, took bread, and broke it. And then he was gone. They said to each other: "Were not our hearts burning within us while he talked with us on the road and opened the Scriptures to us?"

That is the picture behind this platform. Emmaus exists because we believe technology can serve a faithful purpose when it is designed and used wisely to help people walk with Jesus Christ. Not to replace the church, or a pastor, or the Scriptures — but to come alongside, the way a fellow traveller does on a long road.

The road to Emmaus is not a triumphant story. It is a story about confusion, loss, and a stranger who showed up anyway. That feels like an honest place to begin.

<EMMAUS_META>
{
  "scripture": {
    "reference": "Luke 24:32",
    "book": "luke",
    "chapter": 24,
    "displayText": "Were not our hearts burning within us while he talked with us on the road and opened the Scriptures to us?"
  },
  "nextStep": {
    "action": "Read the Emmaus road story in Luke 24:13–35. Notice what the disciples were carrying when the stranger appeared.",
    "primaryButtonText": "Read Luke 24",
    "path": "/bible/read/luke/24"
  },
  "recommendations": [
    {
      "type": "journey",
      "title": "15 Minutes With Jesus",
      "description": "A daily journey that builds a quiet rhythm with God — one step at a time.",
      "path": "/journey/15-minutes-with-jesus/day/1"
    }
  ],
  "followUpPrompts": [
    "Why did the disciples not recognise Jesus on the road?",
    "What does it mean that their hearts were burning?",
    "How do I read the Bible the way Jesus opened the Scriptures?"
  ],
  "handoffType": null
}
</EMMAUS_META>`,

  greeting: `Good to have you here.

Emmaus is a place to bring whatever you are working through — a question about faith, something you have read in Scripture, a season that feels hard, or simply a desire to go deeper with God. There is no right or wrong way to begin.

What is on your mind today?

<EMMAUS_META>
{
  "scripture": null,
  "nextStep": null,
  "recommendations": [],
  "followUpPrompts": [
    "I feel far from God at the moment.",
    "I have a question about something I read in the Bible.",
    "I want to build a better rhythm of prayer."
  ],
  "handoffType": null
}
</EMMAUS_META>`,

  unknown: `Ask Emmaus is currently using a limited development response provider. Your question was received correctly, but this test provider does not yet have a suitable response for it.

If you are testing the platform, try one of the following prompts — each has a prepared response: "I feel far from God", "How do I pray?", "Why is this called Emmaus?", or "Where should I start in the Bible?"

When the real OpenAI-backed provider is connected, Emmaus will be able to respond to any question naturally.

<EMMAUS_META>
{
  "scripture": null,
  "nextStep": null,
  "recommendations": [],
  "followUpPrompts": [
    "I feel far from God at the moment.",
    "How do I build a prayer habit?",
    "Why is this called Emmaus?"
  ],
  "handoffType": null
}
</EMMAUS_META>`,

  bible_understanding: `That passage carries more than it first appears to.

John's Gospel opens with the Greek word *Logos* — Word. Before anything else existed, the Word was already there, with God, and as God. John is making an enormous claim before a single miracle, a single healing, a single conversation has taken place.

Then comes verse 14: "The Word became flesh and made his dwelling among us." The eternal God entered our ordinary world. Not as a vision. Not as a force. But as a person — touchable, hungry, tired, moved to tears.

What John is doing here is helping us see that Jesus is not the best of human examples. He is God, who crossed the infinite distance between heaven and earth to find us.

This chapter is worth sitting with slowly. Ask yourself: what does it mean that God chose to become *this* — human, particular, named, known?

Today — read just the opening eighteen verses again. Notice every time John says something about *light*. What is being contrasted with the light?

<EMMAUS_META>
{
  "scripture": {
    "reference": "John 1:14",
    "book": "john",
    "chapter": 1,
    "displayText": "The Word became flesh and made his dwelling among us."
  },
  "nextStep": {
    "action": "Read John 1:1–18 slowly. Notice every reference to light and darkness.",
    "primaryButtonText": "Read John 1",
    "path": "/bible/read/john/1"
  },
  "recommendations": [
    {
      "type": "journey",
      "title": "Walk Through John",
      "description": "A 21-chapter journey through the Gospel — meeting Jesus as John saw him.",
      "path": "/bible/journey/walk-through-john"
    }
  ],
  "followUpPrompts": [
    "What does it mean that Jesus is the Word?",
    "Who was John writing this Gospel for?",
    "Help me pray through what I've just read."
  ],
  "handoffType": null
}
</EMMAUS_META>`,

  personal_struggle: `That is a real and honest thing to bring.

Feeling far from God is more common than most people admit. You will find it running through the Psalms, through the writings of Paul, through almost every saint who has left an account of their life with Jesus. Distance — perceived distance — is part of the journey, not evidence that you have failed it.

Sometimes it comes because life has become overwhelming, and there is simply no room left to notice. Sometimes it is disappointment — something we prayed for did not happen. Sometimes it is guilt that has gone unnamed. And sometimes, honestly, there is no obvious reason at all.

Psalm 42 was written by someone who knew this feeling. "As the deer pants for streams of water, so my soul pants for you, my God." The person who wrote those words was not feeling close to God. They were *thirsty* for God — which is a very different thing. And yet they kept turning toward him, even in the ache.

The distance you feel does not mean God has moved. It may simply mean you are more honest than most people allow themselves to be.

Today — read Psalm 42 slowly. When you reach a verse that resonates, stop and turn it into a short prayer. You do not need the right words. A sentence is enough.

<EMMAUS_META>
{
  "scripture": {
    "reference": "Psalm 42:1",
    "book": "psalms",
    "chapter": 42,
    "displayText": "As the deer pants for streams of water, so my soul pants for you, my God."
  },
  "nextStep": {
    "action": "Read Psalm 42 slowly. Stop at any verse that resonates and turn it into a short prayer.",
    "primaryButtonText": "Open Psalm 42",
    "path": "/bible/read/psalms/42"
  },
  "recommendations": [
    {
      "type": "journey",
      "title": "15 Minutes With Jesus",
      "description": "A daily journey that builds a quiet rhythm with God — even when it is hard.",
      "path": "/journey/15-minutes-with-jesus/day/1"
    },
    {
      "type": "room",
      "title": "Emmaus Rooms",
      "description": "A small group of people walking the same journey — you do not have to do this alone.",
      "path": "/rooms"
    }
  ],
  "followUpPrompts": [
    "Why does God sometimes feel silent?",
    "Help me pray when I do not know what to say.",
    "Is it normal to doubt?"
  ],
  "handoffType": null
}
</EMMAUS_META>`,

  practical_discipleship: `Prayer is one of those things that can feel simpler and harder than it should.

Simpler — because there is no correct form. No threshold of eloquence. No minimum word count. Jesus said when you pray, go to your room, close the door, and talk to your Father who sees in secret (Matthew 6:6). That is it. The relationship is already there. You are not building it from scratch every time you pray — you are returning to something that already exists.

Harder — because our minds wander, life fills in every spare moment, and sitting in silence can feel unnatural when we are not practiced at it.

What helps many people is having something to guide the shape of prayer without scripting every word. Jesus gave his disciples what we call the Lord's Prayer — not as a formula to recite, but as a shape. It moves from adoration (who God is) to surrender (your kingdom come) to petition (our daily needs) to forgiveness to protection. That movement can become your own.

A simple place to start: five minutes, a regular time, and one of the Psalms to read before you begin. Let the Psalm give you language when yours runs out.

Today — choose a time. Set a small alarm. When it goes off, read Psalm 23 slowly and then sit in silence for two minutes. That is the whole practice for today.

<EMMAUS_META>
{
  "scripture": {
    "reference": "Matthew 6:6",
    "book": "matthew",
    "chapter": 6,
    "displayText": "But when you pray, go into your room, close the door and pray to your Father, who is unseen."
  },
  "nextStep": {
    "action": "Set a five-minute alarm for tomorrow morning. Read Psalm 23, then sit in silence for two minutes.",
    "primaryButtonText": "Open Psalm 23",
    "path": "/bible/read/psalms/23"
  },
  "recommendations": [
    {
      "type": "journey",
      "title": "15 Minutes With Jesus",
      "description": "A daily journey that builds a prayer and reflection rhythm one step at a time.",
      "path": "/journey/15-minutes-with-jesus/day/1"
    }
  ],
  "followUpPrompts": [
    "What if I do not know what to say when I pray?",
    "Show me the Lord's Prayer in Scripture.",
    "How do I build a consistent quiet time?"
  ],
  "handoffType": null
}
</EMMAUS_META>`,

  theological: `That question sits at the heart of a lot of honest faith.

Forgiveness — real forgiveness — is not a feeling. It is a decision made before the feeling arrives, and sometimes long before it does. Which is both freeing and demanding.

Jesus makes a striking connection in Matthew 6: "Forgive us our debts, as we also have forgiven our debtors." He ties our receiving of forgiveness to our extending of it — not because God is keeping score, but because an unforgiven heart cannot hold grace very well. Bitterness is like trying to carry water in a cracked vessel.

Paul writes in Ephesians 4: "Be kind and compassionate to one another, forgiving each other, just as in Christ God forgave you." The basis of forgiveness toward others is what has already been done for us — not our own strength, but borrowed grace.

Forgiveness does not mean pretending nothing happened. It does not mean the relationship is restored automatically. It does not remove consequences. What it does is release you from being a prisoner of someone else's actions.

There is one more important thing: forgiving someone does not require them to be present, or even to know. It happens in you, between you and God.

Today — write the name of the person you are thinking of on a piece of paper. Tell God honestly that you want to forgive them, even if you do not feel it yet. Ask him to help you. That is enough to begin.

<EMMAUS_META>
{
  "scripture": {
    "reference": "Ephesians 4:32",
    "book": "ephesians",
    "chapter": 4,
    "displayText": "Be kind and compassionate to one another, forgiving each other, just as in Christ God forgave you."
  },
  "nextStep": {
    "action": "Write the person's name on paper. Tell God honestly you want to forgive them, even if you do not feel it yet.",
    "primaryButtonText": "Open Ephesians 4",
    "path": "/bible/read/ephesians/4"
  },
  "recommendations": [
    {
      "type": "journey",
      "title": "15 Minutes With Jesus",
      "description": "A daily journey that builds grace into your rhythm with God.",
      "path": "/journey/15-minutes-with-jesus/day/1"
    },
    {
      "type": "pastor",
      "title": "Talk with your pastor",
      "description": "Some conversations about forgiveness are worth having with a real person.",
      "path": "/rooms"
    }
  ],
  "followUpPrompts": [
    "What if I cannot feel forgiveness?",
    "Does forgiving someone mean the relationship goes back to normal?",
    "How did Jesus forgive people who hurt him?"
  ],
  "handoffType": null
}
</EMMAUS_META>`,

  resource_discovery: `There are a few different places to begin, depending on where you are right now.

If you want to start with Scripture — and that is always a good place to begin — Walk Through John is designed for exactly that. It takes you through all 21 chapters of John's Gospel, one chapter at a time. John wrote his Gospel with this specific aim: "that you may believe that Jesus is the Messiah, the Son of God, and that by believing you may have life in his name." It is the best introduction to Jesus there is.

If you are looking for a more structured daily rhythm, 15 Minutes With Jesus builds a simple quiet-time practice over several weeks. It combines Scripture, reflection, and prayer — all in a format that fits into a normal morning.

If you would rather start in community — with other people who are on the same path — Emmaus Rooms are small groups who share a journey together. Some people find that accountability and conversation make the journey stick in a way solo reading never quite does.

All three are valid starting points. The question is: what has been missing for you? Time? Understanding? Community?

<EMMAUS_META>
{
  "scripture": {
    "reference": "John 20:31",
    "book": "john",
    "chapter": 20,
    "displayText": "But these are written that you may believe that Jesus is the Messiah, the Son of God, and that by believing you may have life in his name."
  },
  "nextStep": {
    "action": "Start Walk Through John — one chapter, about 5–7 minutes of reading.",
    "primaryButtonText": "Begin Walk Through John",
    "path": "/bible/journey/walk-through-john"
  },
  "recommendations": [
    {
      "type": "journey",
      "title": "Walk Through John",
      "description": "21 chapters. Meet Jesus as John saw him.",
      "path": "/bible/journey/walk-through-john"
    },
    {
      "type": "journey",
      "title": "15 Minutes With Jesus",
      "description": "A structured daily rhythm — Scripture, reflection, and prayer.",
      "path": "/journey/15-minutes-with-jesus/day/1"
    },
    {
      "type": "room",
      "title": "Emmaus Rooms",
      "description": "Do the journey with others in a small community group.",
      "path": "/rooms"
    }
  ],
  "followUpPrompts": [
    "Tell me more about Walk Through John.",
    "What is the 15 Minutes With Jesus journey?",
    "How do Emmaus Rooms work?"
  ],
  "handoffType": null
}
</EMMAUS_META>`,
};

export class MockProvider implements LLMProvider {
  async *streamCompletion(
    messages: LLMMessage[],
    _opts?: { maxTokens?: number }
  ): AsyncGenerator<StreamChunk> {
    // Find the last user message to classify
    const lastUserMsg = [...messages].reverse().find(m => m.role === "user")?.content ?? "";
    const key = classifyMessage(lastUserMsg);
    const response = MOCK_RESPONSES[key];

    // Simulate streaming by yielding paragraph by paragraph with small delays
    const paragraphs = response.split("\n\n");
    for (let i = 0; i < paragraphs.length; i++) {
      const para = paragraphs[i];
      if (!para.trim()) continue;

      // Yield the paragraph in small chunks
      const words = para.split(" ");
      let buffer = "";
      for (const word of words) {
        buffer += (buffer.trimStart() ? " " : "") + word;
        if (buffer.length > 40) {
          yield { content: buffer, done: false };
          // Reset with a trailing space so the next word joins naturally.
          // Trim the leading space if this is the very start of a new paragraph.
          buffer = " ";
          // Small artificial delay for natural feel
          await new Promise<void>(resolve => setTimeout(resolve, 15));
        }
      }
      // Flush remainder — trim any leading space left from the reset
      if (buffer.trim()) yield { content: buffer.trimStart(), done: false };

      // Paragraph break
      if (i < paragraphs.length - 1) {
        yield { content: "\n\n", done: false };
        await new Promise<void>(resolve => setTimeout(resolve, 30));
      }
    }

    yield { content: "", done: true };
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

let _provider: LLMProvider | null = null;

export function createLLMProvider(): LLMProvider {
  if (_provider) return _provider;

  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey && apiKey.startsWith("sk-")) {
    console.log("[Emmaus] Using OpenAI provider (gpt-4o)");
    _provider = new OpenAIProvider(apiKey);
  } else {
    console.log("[Emmaus] OPENAI_API_KEY not set — using mock provider");
    _provider = new MockProvider();
  }

  return _provider;
}

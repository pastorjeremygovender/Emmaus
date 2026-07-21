// ─── Media Studio — content-generation templates ─────────────────────────────
// Seed data removed. All kits start empty; the Reset Demo Data action also
// clears to empty. Content generators are used by MediaKitWizard at creation time.

import type { GraphicContent, SuggestedShort } from './media-studio-types';

// ─── Content generators (template-based, no AI) ───────────────────────────────

export function generateGraphicContent(
  quote: string,
  scripture: string,
  dimensions: string,
  template: 'classic' | 'modern' | 'minimal' = 'classic',
): string {
  const c: GraphicContent = { quote, scripture, template, church: 'Isipingo Community Church', dimensions };
  return JSON.stringify(c);
}

export function generateFacebookCaption(title: string, scripture: string, summary: string): string {
  return `📖 ${title}\n\n"${summary}"\n\nThis week's sermon reminds us that God's grace reaches us even in our lowest moments. Whatever you're facing today, know that you are seen, known, and deeply loved.\n\nScripture: ${scripture}\n\nJoin us this Sunday as we continue our journey together. Share this post and bless someone in your community today. 🙏\n\n#IsipingoCommunityChurch #SundaySermon #Faith #Grace`;
}

export function generateInstagramCaption(title: string, scripture: string): string {
  return `✨ ${title}\n\n📖 ${scripture}\n\nDrop a 🙌 if this speaks to your heart today.\n\n#Emmaus #IsipingoCommunityChurch #DailyDevotional #ChristianLife #FaithJourney #Worship #Scripture #BibleVerse`;
}

export function generateWhatsAppMessage(title: string, scripture: string, summary: string): string {
  return `🌅 *Good morning from Isipingo Community Church!*\n\nThis week we're walking through: *"${title}"*\n\n_"${summary}"_\n\n📖 ${scripture}\n\nTake a moment today to reflect on how God's word applies to your life right now. We're praying for you! 💙\n\n— Pastor Jeremy & the Emmaus Team`;
}

export function generateYouTubeCommunityPost(title: string, scripture: string): string {
  return `🎙️ New sermon is live: "${title}"\n\n📖 ${scripture}\n\nWe unpacked an incredible story this week. God's kindness isn't something we earn — it finds us. Watch the full message on our channel and share it with someone who needs encouragement today.\n\n💬 What part of the message stood out most to you? Tell us in the comments!\n\n#Sermon #IsipingoCommunityChurch #Faith`;
}

export function generateYouTubeThumbnailConcept(title: string, speaker: string): string {
  return `THUMBNAIL CONCEPT — "${title}"\n\nVisual: Close-up of hands open in prayer or reaching upward — warm golden lighting\nBold text overlay (top): "${title}"\nSub-text (bottom): "${speaker}"\nChurch logo: bottom-right corner, white version\nColour palette: Deep teal (#2a7c6f) gradient with warm amber light source\nFont: Bold sans-serif, white with dark drop shadow\nEmotion: Hopeful, welcoming, not dramatic\n\nNOTES FOR DESIGNER\n- Avoid stock-photo feel; use authentic community imagery where possible\n- Keep overlay text under 6 words\n- High contrast for small-size thumbnail preview`;
}

export function generateYouTubeDescription(
  title: string, speaker: string, scripture: string, summary: string, topics: string[],
): string {
  const tags = topics.map(t => `#${t.replace(/\s+/g, '')}`).join(' ');
  return `${title}\n${speaker} | Isipingo Community Church\n\n📖 Scripture: ${scripture}\n\n${summary}\n\nIn this message we explore what it means to receive God's grace when we feel most unworthy. Through the story found in ${scripture}, we discover that belonging to God's family is never about performance — it's always about covenant.\n\n🕐 CHAPTERS\n0:00 — Welcome & Announcements\n3:15 — Opening Prayer\n5:30 — Scripture Reading: ${scripture}\n8:00 — Message: ${title}\n38:45 — Altar Call & Prayer\n45:00 — Closing Blessing\n\n📌 PINNED COMMENT\nIf this message blessed you, share it with someone who needs to hear it today. Subscribe and turn on notifications so you never miss a Sunday message. We love and appreciate you! 🙏\n\n🔗 Emmaus discipleship app: [link]\n📩 Prayer: info@isipingo.church\n🌐 isipingo.church\n\n${tags} #IsipingoCommunityChurch #Sermon #Faith`;
}

export function generateAudioScript(title: string, scripture: string, summary: string): string {
  return `AUDIO NARRATION SCRIPT — 2-MINUTE DEVOTIONAL\n"${title}"\nTarget duration: ~2 minutes | ~280 words\n\n---\n\n[INTRO — 10 seconds]\nGood morning. I'm glad you're here. Take a breath. This is your moment with God.\n\n[SCRIPTURE — 20 seconds]\nToday we open ${scripture}.\n[Read the full verse(s) here before continuing.]\n\n[REFLECTION — 80 seconds]\n${summary}\n\nThink about that for a moment. There are places in your life — maybe today, maybe right now — where you feel like you're in your own Lo Debar. A place of isolation. A place where you've convinced yourself that you don't deserve to be at the table.\n\nBut the King is calling for you. Not because of what you've done. Because of covenant. Because of love.\n\n[APPLICATION — 30 seconds]\nHere's your invitation today: receive the kindness that has always been coming your way. You don't have to earn your place. You've already been given one.\n\n[CLOSING PRAYER — 20 seconds]\nFather, thank You for covenant love that reaches the broken places. Help us to receive what You've freely given. Teach us to live as those who belong at Your table. Amen.\n\n---\n\nPRODUCTION NOTES\nTone: Warm, pastoral, conversational — not performative\nPace: Slow and deliberate; allow space for reflection\nMusic bed: Soft ambient piano or acoustic guitar at -18 dB under narration\nNo AI voice synthesis yet — this script is for a recorded narration.`;
}

export function generateSuggestedShorts(title: string, scripture: string): SuggestedShort[] {
  return [
    {
      title: 'The Moment That Changes Everything',
      reason: 'High-emotion pivot where the main truth lands. Perfect hook for social.',
      startTime: '18:30',
      endTime: '20:45',
      caption: `This is the moment everything changes. 👆 Watch to see what happens when the King calls for you. 📖 ${scripture} #Faith #Grace #IsipingoCommunityChurch`,
      thumbnailText: 'THE KING IS CALLING',
    },
    {
      title: 'You Are Not Forgotten',
      reason: 'Personal, vulnerable moment — connects with viewers experiencing isolation or shame.',
      startTime: '24:10',
      endTime: '26:00',
      caption: 'No matter where you\'ve been or what you\'ve done — you are not forgotten. 💙 #ChristianLife #Faith #Healing',
      thumbnailText: 'YOU ARE NOT FORGOTTEN',
    },
    {
      title: 'What Lo Debar Looks Like Today',
      reason: 'Cultural bridge that makes the ancient story immediately relevant.',
      startTime: '10:05',
      endTime: '12:30',
      caption: `We all have a Lo Debar. Here's what it looks like today. 📖 ${scripture} #Sermon #BibleStudy`,
      thumbnailText: 'YOUR LO DEBAR',
    },
    {
      title: 'This Is What Grace Actually Looks Like',
      reason: 'Clear, quotable definition of grace — works well as a standalone clip.',
      startTime: '31:00',
      endTime: '32:45',
      caption: 'Grace isn\'t what you think it is. 🙌 #Grace #Gospel #ChristianShorts',
      thumbnailText: 'WHAT GRACE LOOKS LIKE',
    },
    {
      title: 'The Invitation You Didn\'t Expect',
      reason: 'Closing altar call — emotionally powerful and evangelistic.',
      startTime: '38:45',
      endTime: '41:00',
      caption: 'You didn\'t expect this invitation. But it\'s real and it\'s for you. 🙏 #Hope #IsipingoCommunityChurch',
      thumbnailText: 'AN UNEXPECTED INVITATION',
    },
  ];
}

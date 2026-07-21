export const DEMO_USER = {
  id: 'demo-user-1',
  email: 'demo@emmaus.church',
  preferredName: 'Friend',
  role: 'user',
  createdAt: new Date().toISOString(),
  lastActiveAt: new Date().toISOString(),
  currentFeeling: null,
  feelingUpdatedAt: null,
};

export const DEMO_ADMIN = {
  id: 'demo-admin-1',
  email: 'pastor@emmaus.church',
  preferredName: 'Jeremy',
  role: 'admin',
  createdAt: new Date().toISOString(),
  lastActiveAt: new Date().toISOString(),
  currentFeeling: null,
  feelingUpdatedAt: null,
};

export const DEMO_JOURNEYS = [
  {
    id: "15-minutes-with-jesus",
    title: "15 Minutes with Jesus",
    description: "A short, guided journey to help you connect with Jesus in the middle of your everyday life.",
    journeyType: "core",
    durationDays: 7,
    status: "Published",
  },
  {
    id: "gods-kindness-restores-the-broken",
    title: "God's Kindness Restores the Broken",
    description: "5 short weekday devotionals based on Sunday's sermon.",
    journeyType: "companion",
    durationDays: 5,
    status: "Published",
    sermon: {
      title: "God's Kindness Restores the Broken",
      speaker: "Pastor Jeremy Govender",
      scripture: "2 Samuel 9",
      youtubeUrl: "https://www.youtube.com/watch?v=PLACEHOLDER_VIDEO_ID"
    }
  }
];

export const DEMO_STEPS = [
  // 15 Minutes with Jesus
  {
    journeyId: "15-minutes-with-jesus",
    day: 1,
    title: "Jesus Meets You Here",
    mentorIntro: "Wherever you are right now — in the middle of a busy week or a quiet moment — Jesus is already here.",
    scripture: "John 1:14 — 'The Word became flesh and made his dwelling among us.'",
    devotional: "We often think we need to arrive at a certain place before Jesus shows up. But the good news of the Incarnation is that God came to us — into our ordinary world, with all its noise and mess. He didn't wait for us to have it together. He simply came.",
    reflectionQuestion: "Where do you sense Jesus showing up in your ordinary life right now?",
    prayerPrompt: "Lord Jesus, thank you that you came to be with us. Help me to notice your presence in my everyday moments today.",
    actionStep: "Take two minutes to sit quietly before you begin your day. Simply say: 'Jesus, you are here.'"
  },
  {
    journeyId: "15-minutes-with-jesus",
    day: 2,
    title: "You Are Not Alone",
    mentorIntro: "One of the most powerful promises in Scripture is simply this: you are not alone.",
    scripture: "Matthew 28:20 — 'I am with you always, to the very end of the age.'",
    devotional: "Loneliness is one of the deepest human aches. We were made for connection — with God and with each other. The risen Jesus doesn't leave his people to figure things out on their own. His final words to his disciples weren't instructions or warnings. They were a promise: I am with you.",
    reflectionQuestion: "When do you feel most alone? How does the promise of Jesus' presence speak to that?",
    prayerPrompt: "Jesus, in the moments when I feel most isolated, remind me that you are with me. Teach me to lean into your presence.",
    actionStep: "Reach out to one person today — a text, a call, or a simple note — and let them know you were thinking of them."
  },
  {
    journeyId: "15-minutes-with-jesus",
    day: 3,
    title: "Learning to Trust",
    mentorIntro: "Trust is something we build slowly, through small acts of surrender.",
    scripture: "Proverbs 3:5–6 — 'Trust in the Lord with all your heart and lean not on your own understanding; in all your ways submit to him, and he will make your paths straight.'",
    devotional: "We are wired to figure things out ourselves. And there's nothing wrong with wisdom and planning. But trusting God means bringing our plans and worries to him — not as a last resort, but as a first instinct. It's a practice, not a one-time event.",
    reflectionQuestion: "What is one area of your life where you find it hardest to trust God? Why?",
    prayerPrompt: "Lord, where I am holding on tightly out of fear, help me to open my hands. I choose to trust you with [name the specific thing].",
    actionStep: "Write down one worry or uncertainty on a piece of paper. Then consciously hand it over to God — you could even tear the paper up as an act of surrender."
  },
  {
    journeyId: "15-minutes-with-jesus",
    day: 4,
    title: "Listening to Jesus",
    mentorIntro: "The Christian life is not just about speaking to God — it's about learning to hear him.",
    scripture: "John 10:27 — 'My sheep listen to my voice; I know them, and they follow me.'",
    devotional: "We live in one of the noisiest times in human history. Our devices, our schedules, our anxieties — they all compete for our attention. Learning to hear Jesus requires something counter-cultural: stillness. It doesn't have to be a long time. Even five minutes of quiet attentiveness can open our hearts to what God is saying.",
    reflectionQuestion: "What makes it hard for you to be still and listen? What might help?",
    prayerPrompt: "Jesus, tune my heart to hear yours. Help me to silence the noise within me so that I can hear what you are saying.",
    actionStep: "Set a timer for five minutes. Sit in silence. Don't pray words — just listen. Afterward, write down any impression, verse, or thought that came to mind."
  },
  {
    journeyId: "15-minutes-with-jesus",
    day: 5,
    title: "Taking One Faithful Step",
    mentorIntro: "Faith is rarely a leap. Usually it's a small step taken in the right direction.",
    scripture: "Hebrews 11:8 — 'By faith Abraham obeyed and went, even though he did not know where he was going.'",
    devotional: "Abraham didn't have a detailed map. He had a direction and a voice he was learning to trust. Most of the time, faithful obedience looks like that — one step taken with what you know, even when the destination is unclear. You don't need to see the whole staircase. Just take the next step.",
    reflectionQuestion: "What is one step of obedience you have been hesitating to take? What would it look like to take it today?",
    prayerPrompt: "Lord, give me the courage to take the next faithful step, even when I can't see the whole path. I trust that you are leading.",
    actionStep: "Identify one small, concrete act of obedience you can take today. Write it down and do it before tonight."
  },
  {
    journeyId: "15-minutes-with-jesus",
    day: 6,
    title: "Walking with Others",
    mentorIntro: "None of us were meant to walk this road alone.",
    scripture: "Hebrews 10:24–25 — 'Let us consider how we may spur one another on toward love and good deeds, not giving up meeting together... but encouraging one another.'",
    devotional: "The Christian life is always a communal life. Even the great figures of faith were embedded in community — Paul had Timothy, Jesus had the twelve. We grow faster, fall less often, and love more deeply when we do it with others who are walking the same road.",
    reflectionQuestion: "Who is walking with you right now? Who could you walk alongside more intentionally?",
    prayerPrompt: "Lord, thank you for the people you have placed in my life. Help me to be a good companion on this road — to encourage, listen, and serve.",
    actionStep: "Name one person in your life who is walking through something hard. Pray for them right now, and then find a way to let them know you are thinking of them today."
  },
  {
    journeyId: "15-minutes-with-jesus",
    day: 7,
    title: "Keep Walking",
    mentorIntro: "You've made it to Day 7. But the journey doesn't end here.",
    scripture: "Philippians 1:6 — 'He who began a good work in you will carry it on to completion until the day of Christ Jesus.'",
    devotional: "Seven days is just the beginning. The Christian life is a long road — not a sprint. There will be days when walking feels easy and days when it feels impossible. What matters is that you keep showing up. God is at work in you, and he finishes what he starts. You are not alone on this road, and you are not expected to be perfect — just faithful.",
    reflectionQuestion: "What has been the most significant thing God has shown you in these seven days?",
    prayerPrompt: "Lord, thank you for walking with me. Help me to keep going — one day, one step at a time. I trust that you will complete the work you have begun in me.",
    actionStep: "Write a short prayer or note to yourself for the days ahead. Seal it and open it in a month."
  },
  // God's Kindness Restores the Broken
  {
    journeyId: "gods-kindness-restores-the-broken",
    day: 1,
    title: "When Brokenness Changes How You See Yourself",
    mentorIntro: "Before we can understand the grace Mephibosheth received, we need to sit with how he saw himself.",
    scripture: "2 Samuel 9:8 — 'What is your servant, that you should notice a dead dog like me?'",
    devotional: "Mephibosheth didn't think of himself as royalty — even though he was. Brokenness has a way of reshaping our identity. Physical limitations, family loss, years of hiding in Lo Debar — all of it had taught him to see himself as worthless. Before we receive grace, we often have to admit how deeply we've believed the lie that we don't deserve it.",
    reflectionQuestion: "In what area of your life do you feel most like 'a dead dog' — unworthy of kindness?",
    prayerPrompt: "Lord, I confess the places where I have believed I am too broken to be loved. Speak your truth over those areas today.",
    actionStep: "Write down one lie you have believed about yourself. Then write beside it what God's word says is true.",
    sermonTimestampSeconds: 736,
    sermonLink: "https://www.youtube.com/watch?v=PLACEHOLDER_VIDEO_ID&t=736s"
  },
  {
    journeyId: "gods-kindness-restores-the-broken",
    day: 2,
    title: "The King Is Looking for You",
    mentorIntro: "David's question — 'Is there anyone still left of the house of Saul?' — echoes a deeper question God is always asking.",
    scripture: "2 Samuel 9:1 — 'David asked, Is there anyone still left of the house of Saul to whom I can show kindness for Jonathan's sake?'",
    devotional: "David wasn't looking for Mephibosheth because Mephibosheth had anything to offer. He was looking for him because of a covenant — a promise made to Jonathan. God's kindness toward us is not based on our performance. It is based on a covenant sealed in the blood of Jesus. The King is looking for you — not because you have earned it, but because of his promise.",
    reflectionQuestion: "How does it change things to know that God seeks you out — not because of what you offer, but because of his covenant love?",
    prayerPrompt: "Thank you, Lord, that you came looking for me. Help me to stop hiding and to receive your kindness.",
    actionStep: "Spend a few minutes simply receiving — not asking, not confessing, just sitting in the reality that God is glad you are here.",
    sermonTimestampSeconds: 1102,
    sermonLink: "https://www.youtube.com/watch?v=PLACEHOLDER_VIDEO_ID&t=1102s"
  },
  {
    journeyId: "gods-kindness-restores-the-broken",
    day: 3,
    title: "Grace Brings You Out of Lo Debar",
    mentorIntro: "Lo Debar means 'no pasture' — a place of nothing. Many of us are living there emotionally or spiritually.",
    scripture: "2 Samuel 9:5 — 'So King David had him brought from Lo Debar.'",
    devotional: "Mephibosheth had been surviving in Lo Debar — a place of nothing. It was his hiding place, but it had become his prison. Grace doesn't leave us where we are. It comes and finds us in our Lo Debar — in our emptiness, our shame, our self-imposed exile — and brings us out. The move from Lo Debar to the king's table is not something we engineer. It is something grace does.",
    reflectionQuestion: "What is your 'Lo Debar'? What situation, habit, or mindset keeps you hidden away from the life God has for you?",
    prayerPrompt: "Lord, come and find me in the places I have been hiding. Bring me out of my Lo Debar and into your presence.",
    actionStep: "Name one way you have been 'hiding' — from God, from community, from growth. Take one small step out of hiding today.",
    sermonTimestampSeconds: 1540,
    sermonLink: "https://www.youtube.com/watch?v=PLACEHOLDER_VIDEO_ID&t=1540s"
  },
  {
    journeyId: "gods-kindness-restores-the-broken",
    day: 4,
    title: "There Is a Place for You at the Table",
    mentorIntro: "The most stunning detail in the story is this: David didn't just help Mephibosheth — he gave him a seat at his own table.",
    scripture: "2 Samuel 9:13 — 'And Mephibosheth lived in Jerusalem, because he always ate at the king's table; he was lame in both feet.'",
    devotional: "Every day, Mephibosheth ate at the king's table. His lameness was hidden beneath the tablecloth. He was treated not as a charity case, but as a son. This is exactly what God does with us. He doesn't just tolerate us or help us from a distance — he seats us at his table, covers our shame, and calls us family. There is a place at the table for you. Not because you have earned it. Because you have been brought in.",
    reflectionQuestion: "How do you respond to the idea that God wants you at his table — not just in his service? Does this feel true to you?",
    prayerPrompt: "Lord, help me to take my seat at your table. Where I have believed I am only worthy to serve and not to belong, speak your truth.",
    actionStep: "Share a meal with someone today — or invite someone to share one with you. Let it be a small act of the kind of table fellowship God models.",
    sermonTimestampSeconds: 1980,
    sermonLink: "https://www.youtube.com/watch?v=PLACEHOLDER_VIDEO_ID&t=1980s"
  },
  {
    journeyId: "gods-kindness-restores-the-broken",
    day: 5,
    title: "Live as Someone Who Has Been Restored",
    mentorIntro: "The story ends not with Mephibosheth leaving the table — but with him staying. Every day, he ate there. The restored life is meant to be our new normal.",
    scripture: "2 Samuel 9:11 — 'So Mephibosheth ate at David's table like one of the king's sons.'",
    devotional: "Mephibosheth could have gone back to Lo Debar. The king's kindness could have felt too good to be true. But he stayed. He lived as someone who had been restored. This is the invitation for all of us — not just to receive grace once, but to inhabit it daily. To eat at the table every day. To live as sons and daughters, not as dead dogs. Restoration is not a moment — it is a way of life.",
    reflectionQuestion: "What would it look like for you to 'live at the table' — to make your daily life an expression of someone who has been fully restored and accepted by God?",
    prayerPrompt: "Lord, help me to stop going back to Lo Debar. Teach me to live as someone who belongs at your table — every ordinary day.",
    actionStep: "Write a short statement about who you are in Christ — not what you do, but who you are. Read it aloud to yourself. Keep it somewhere visible this week.",
    sermonTimestampSeconds: 2344,
    sermonLink: "https://www.youtube.com/watch?v=PLACEHOLDER_VIDEO_ID&t=2344s"
  }
];

export const DEMO_PROGRESS = {
  "15-minutes-with-jesus": {
    journeyId: "15-minutes-with-jesus",
    currentDay: 1,
    completedDays: [],
    startedAt: new Date().toISOString(),
    lastCompletedAt: null
  }
};

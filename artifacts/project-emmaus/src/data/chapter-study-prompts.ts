// ─── Go Deeper — Chapter Study Prompts ───────────────────────────────────────
// 2–3 curated study questions per chapter, surfaced in ChapterCompletion.
// Key: `${bookId}:${chapter}`

export type StudyPrompt = {
  id: string;
  question: string;
};

export type ChapterStudyPrompts = {
  bookId: string;
  chapter: number;
  prompts: StudyPrompt[];
};

// ─── Registry ─────────────────────────────────────────────────────────────────

const PROMPTS: Record<string, StudyPrompt[]> = {

  // ── John 1 ───────────────────────────────────────────────────────────────
  'john:1': [
    { id: 'j1-a', question: `John calls Jesus "the Word". What does it mean to you that God communicates himself through a person rather than just a message?` },
    { id: 'j1-b', question: `Verse 12 says those who receive him are given power to become children of God. What does it look like to receive Jesus in your everyday life?` },
    { id: 'j1-c', question: `Philip told Nathanael, "Come and see." Who first invited you to explore faith — and who might you invite with those same words?` },
  ],

  // ── John 2 ───────────────────────────────────────────────────────────────
  'john:2': [
    { id: 'j2-a', question: `Jesus turns water into wine at a family celebration. What does this tell you about how Jesus sees everyday life and ordinary needs?` },
    { id: 'j2-b', question: `When Jesus clears the temple, his disciples remember the scripture "Zeal for your house will consume me." Where in your life does holy frustration call you to act?` },
    { id: 'j2-c', question: `Verse 25 says Jesus "knew what was in man." How does it feel to be fully known by someone who still chooses to be with you?` },
  ],

  // ── John 3 ───────────────────────────────────────────────────────────────
  'john:3': [
    { id: 'j3-a', question: `"You must be born again." Nicodemus came with answers but left with a question. What question is this chapter asking of you personally?` },
    { id: 'j3-b', question: `John 3:16 is perhaps the most quoted verse in the Bible. Read it slowly again. What word stands out to you and why?` },
    { id: 'j3-c', question: `John the Baptist says "He must increase, I must decrease." What would it look like for you to live that way this week?` },
  ],

  // ── Luke 1 ───────────────────────────────────────────────────────────────
  'luke:1': [
    { id: 'l1-a', question: `Mary says "Let it be to me according to your word." What area of your life requires that kind of surrender right now?` },
    { id: 'l1-b', question: `Elizabeth calls Mary "blessed among women" before any public miracle. Who in your life do you need to encourage before they see the outcome?` },
    { id: 'l1-c', question: `Zechariah doubted and was silenced; Mary wondered and was blessed. What is the difference between honest questions and unbelief in your own walk?` },
  ],

  // ── Luke 2 ───────────────────────────────────────────────────────────────
  'luke:2': [
    { id: 'l2-a', question: `Jesus was born in a stable, not a palace. What does God's choice to enter the world this way say about who he came for?` },
    { id: 'l2-b', question: `The shepherds "returned, glorifying and praising God." What is an ordinary moment this week where you can respond to God that way?` },
    { id: 'l2-c', question: `Mary "treasured all these things in her heart." Is there something God has done for you that you have not fully paused to treasure?` },
  ],

  // ── Luke 3 ───────────────────────────────────────────────────────────────
  'luke:3': [
    { id: 'l3-a', question: `John calls people to "bear fruits worthy of repentance." What does genuine change look like in your life right now — not just feeling sorry, but acting differently?` },
    { id: 'l3-b', question: `At Jesus' baptism the Father says, "You are my beloved Son; with you I am well pleased." Before Jesus had done his public ministry. What does unconditional approval from God mean to you?` },
    { id: 'l3-c', question: `The crowds ask John "What then shall we do?" and he gives practical answers. What practical step is God asking of you after reading this chapter?` },
  ],

  // ── Luke 4 ───────────────────────────────────────────────────────────────
  'luke:4': [
    { id: 'l4-a', question: `Satan tempted Jesus at his hungriest, in his loneliest place. When are you most vulnerable to temptation, and what truth grounds you?` },
    { id: 'l4-b', question: `Jesus reads Isaiah and says "Today this scripture is fulfilled in your hearing." He claimed to be the fulfilment of a centuries-old promise. What promise of God are you waiting to see fulfilled?` },
    { id: 'l4-c', question: `The people in Nazareth rejected Jesus because they thought they already knew him. Is there anything about Jesus you may have stopped being curious about?` },
  ],

  // ── Luke 5 ───────────────────────────────────────────────────────────────
  'luke:5': [
    { id: 'l5-a', question: `Simon fished all night and caught nothing, then Jesus said try again. Is there something you have given up on that God might be asking you to try again?` },
    { id: 'l5-b', question: `When the paralysed man's friends could not get through the crowd, they cut through the roof. Who in your life needs that kind of relentless intercession?` },
    { id: 'l5-c', question: `Levi left everything and followed Jesus immediately. What would it look like to follow with that same completeness today?` },
  ],

  // ── Luke 6 ───────────────────────────────────────────────────────────────
  'luke:6': [
    { id: 'l6-a', question: `"Blessed are you who are poor, for yours is the kingdom of God." What does it mean to you that the kingdom belongs to those who have nothing?` },
    { id: 'l6-b', question: `Jesus says to love your enemies and do good to those who hate you. Think of someone difficult in your life. What would one act of love toward them look like this week?` },
    { id: 'l6-c', question: `The wise builder dug deep and built on rock. In what area of your life do you feel you are building on sand instead of a solid foundation?` },
  ],

  // ── Luke 7 ───────────────────────────────────────────────────────────────
  'luke:7': [
    { id: 'l7-a', question: `The centurion said he was not worthy for Jesus to enter his house, yet Jesus marvelled at his faith. What does great faith look like that is not based on deserving?` },
    { id: 'l7-b', question: `The sinful woman wept at Jesus' feet. What is it about Jesus that would move you to that kind of vulnerability and gratitude?` },
    { id: 'l7-c', question: `John the Baptist sent disciples to ask "Are you the one?" Even the greatest prophet had moments of doubt. How do you handle seasons of doubt in your own faith?` },
  ],

  // ── Luke 8 ───────────────────────────────────────────────────────────────
  'luke:8': [
    { id: 'l8-a', question: `The parable of the sower describes four responses to God's word. Which soil best describes where you are right now, and what would help you become good soil?` },
    { id: 'l8-b', question: `Jesus slept in the storm and the disciples panicked. Where is your storm right now, and what would it look like to trust that Jesus is in the boat with you?` },
    { id: 'l8-c', question: `The healed man wanted to follow Jesus, but Jesus said "Return home and tell what God has done for you." Your greatest mission field might be your own household.` },
  ],

  // ── Luke 9 ───────────────────────────────────────────────────────────────
  'luke:9': [
    { id: 'l9-a', question: `"Take up your cross daily and follow me." What is the cross you are being asked to carry today?` },
    { id: 'l9-b', question: `On the mountain of transfiguration Peter wanted to build tents and stay. When have you been tempted to stay in a spiritual high rather than come back down and serve?` },
    { id: 'l9-c', question: `"The Son of Man has nowhere to lay his head." Following Jesus does not guarantee comfort. What comfort might you be holding onto too tightly?` },
  ],

  // ── Luke 10 ──────────────────────────────────────────────────────────────
  'luke:10': [
    { id: 'l10-a', question: `The Good Samaritan crossed social boundaries to help a stranger. Who has God placed across your path that you might have been too busy — or too cautious — to help?` },
    { id: 'l10-b', question: `Martha was busy and distracted; Mary chose the "better part." What distracts you most from sitting with Jesus, and what would it take to choose differently?` },
    { id: 'l10-c', question: `"Rejoice that your names are written in heaven." What difference would it make if you lived today out of the security of being known by God?` },
  ],

  // ── Luke 11 ──────────────────────────────────────────────────────────────
  'luke:11': [
    { id: 'l11-a', question: `Jesus teaches the disciples to pray "Your kingdom come." What would it look like for God's kingdom to come in one specific area of your life or community this week?` },
    { id: 'l11-b', question: `Jesus says to ask, seek, and knock — persistently. What have you stopped asking God for, and why?` },
    { id: 'l11-c', question: `"When your eye is healthy, your whole body is full of light." What are you allowing your attention to rest on that may be darkening your outlook?` },
  ],

  // ── Luke 12 ──────────────────────────────────────────────────────────────
  'luke:12': [
    { id: 'l12-a', question: `The rich man stored up treasure for himself but was not "rich toward God." What does being rich toward God look like in your current season of life?` },
    { id: 'l12-b', question: `"Do not be anxious about your life." Name one thing you are anxious about. Now read vv 22–31 again slowly for that specific thing.` },
    { id: 'l12-c', question: `"Where your treasure is, there your heart will be also." Where is your treasure right now — what does your calendar and bank account reveal?` },
  ],

  // ── Luke 13 ──────────────────────────────────────────────────────────────
  'luke:13': [
    { id: 'l13-a', question: `The woman bent over for 18 years was healed on the Sabbath — the day of rest. Where in your life has suffering been so long you have almost stopped expecting freedom?` },
    { id: 'l13-b', question: `The mustard seed and the yeast both work invisibly. Where might God be working in ways you cannot see yet?` },
    { id: 'l13-c', question: `Jesus says the door is narrow. What might you be depending on instead of genuine relationship with him?` },
  ],

  // ── Luke 14 ──────────────────────────────────────────────────────────────
  'luke:14': [
    { id: 'l14-a', question: `The invited guests all made excuses — land, oxen, marriage. What is your current reason for not giving God your full attention?` },
    { id: 'l14-b', question: `"Invite those who cannot repay you." Who could you include this week who has nothing to offer in return?` },
    { id: 'l14-c', question: `Count the cost, Jesus says. Have you counted the cost of following him — and the cost of not following him?` },
  ],

  // ── Luke 15 ──────────────────────────────────────────────────────────────
  'luke:15': [
    { id: 'l15-a', question: `The father runs to meet the returning son. What does this image tell you about how God responds when you return to him?` },
    { id: 'l15-b', question: `The elder son was in the field working — faithful, but resentful. Can you relate to the elder son's complaint? What does his reaction reveal?` },
    { id: 'l15-c', question: `"There is joy in heaven over one sinner who repents." When did you last celebrate someone coming to faith? What would it take to have heaven's perspective?` },
  ],

  // ── Luke 16 ──────────────────────────────────────────────────────────────
  'luke:16': [
    { id: 'l16-a', question: `"You cannot serve God and money." Where do you feel the pull of money competing with your devotion to God?` },
    { id: 'l16-b', question: `The rich man ignored Lazarus at his gate every day. Who is the Lazarus at your gate — someone in need you routinely step over?` },
    { id: 'l16-c', question: `"Whoever is faithful in very little is also faithful in much." What small faithfulness is God asking of you right now?` },
  ],

  // ── Luke 17 ──────────────────────────────────────────────────────────────
  'luke:17': [
    { id: 'l17-a', question: `Only one of ten healed lepers returned to give thanks. What blessings have you received recently that you have not paused to acknowledge?` },
    { id: 'l17-b', question: `"The kingdom of God is in the midst of you." Where do you see glimpses of God's kingdom breaking through in your everyday life?` },
    { id: 'l17-c', question: `The disciples ask "Increase our faith!" and Jesus talks about a mustard seed. What does it mean that the size of your faith matters less than the object of your faith?` },
  ],

  // ── Luke 18 ──────────────────────────────────────────────────────────────
  'luke:18': [
    { id: 'l18-a', question: `The persistent widow kept coming. What have you stopped persistently bringing to God in prayer, and why?` },
    { id: 'l18-b', question: `"Let the little children come to me." What childlike quality — wonder, trust, dependence — do you need to recover in your faith?` },
    { id: 'l18-c', question: `The rich young ruler kept all the commandments but still lacked one thing. What one thing might Jesus identify as the barrier in your own walk with him?` },
  ],

  // ── Luke 19 ──────────────────────────────────────────────────────────────
  'luke:19': [
    { id: 'l19-a', question: `Zacchaeus climbed a tree just to see Jesus. What unusual lengths have you gone to — or would you go to — just to catch a glimpse of him?` },
    { id: 'l19-b', question: `Jesus wept over Jerusalem because they did not recognise the time of their visitation. What might you be missing because you are not paying attention to what God is doing?` },
    { id: 'l19-c', question: `"The Son of Man came to seek and to save the lost." You were once lost and found. How does that shape the way you see others who are still lost?` },
  ],

  // ── Luke 20 ──────────────────────────────────────────────────────────────
  'luke:20': [
    { id: 'l20-a', question: `The tenants killed the servants and then the son. How does the parable challenge you to honestly ask: am I giving God what belongs to him?` },
    { id: 'l20-b', question: `"Render to Caesar what is Caesar's, and to God what is God's." What belongs to God in your life that you have been treating as your own?` },
    { id: 'l20-c', question: `Jesus silences every questioner, but they were asking to trap him, not to know truth. What is the difference in the questions you bring to God?` },
  ],

  // ── Luke 21 ──────────────────────────────────────────────────────────────
  'luke:21': [
    { id: 'l21-a', question: `The widow gave two small coins — all she had. Jesus said she gave more than everyone else. What does radical generosity look like for you, given where you are right now?` },
    { id: 'l21-b', question: `"Stand up and raise your heads, because your redemption is drawing near." How does a future hope change the way you live in a difficult present?` },
    { id: 'l21-c', question: `Jesus warns against hearts weighed down by the cares of life. What care is weighing your heart down most right now, and how do you bring it to God?` },
  ],

  // ── Luke 22 ──────────────────────────────────────────────────────────────
  'luke:22': [
    { id: 'l22-a', question: `At the Last Supper Jesus says "Do this in remembrance of me." When you take communion, what specifically are you remembering — and why does it matter to you personally?` },
    { id: 'l22-b', question: `Peter denied Jesus three times. What fear might cause you to distance yourself from Jesus in a crowd?` },
    { id: 'l22-c', question: `In the Garden, Jesus prayed "Not my will, but yours." What are you currently holding on to that you need to lay down before God?` },
  ],

  // ── Luke 23 ──────────────────────────────────────────────────────────────
  'luke:23': [
    { id: 'l23-a', question: `"Father, forgive them, for they know not what they do." Jesus forgave his killers while dying. Who do you find it hardest to forgive right now?` },
    { id: 'l23-b', question: `The thief on the cross had nothing to offer — only a request: "Remember me." What would it mean to come to Jesus that simply today?` },
    { id: 'l23-c', question: `The centurion said "Certainly this man was innocent." What does it mean that an innocent person died in your place?` },
  ],

  // ── Luke 24 ──────────────────────────────────────────────────────────────
  'luke:24': [
    { id: 'l24-a', question: `The disciples on the road to Emmaus did not recognise Jesus until he broke bread. In what ordinary moments — a meal, a conversation — might Jesus be present and unrecognised?` },
    { id: 'l24-b', question: `"Why do you seek the living among the dead?" Is there anything in your life where you are looking for life in the wrong place?` },
    { id: 'l24-c', question: `The disciples were sent as witnesses "beginning from Jerusalem" — right where they were. Where is your Jerusalem — the place God is sending you to bear witness first?` },
  ],
};

// ─── Public API ───────────────────────────────────────────────────────────────

/** Return study prompts for a chapter, or an empty array if none are seeded. */
export function getChapterStudyPrompts(
  bookId: string,
  chapter: number,
): StudyPrompt[] {
  return PROMPTS[`${bookId}:${chapter}`] ?? [];
}

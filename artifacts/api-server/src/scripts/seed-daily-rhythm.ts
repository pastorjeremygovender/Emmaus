/**
 * Seed — "10 Minutes with Jesus: Starting with Jesus" (Days 1–30)
 *
 * Inserts missing days only (ON CONFLICT DO NOTHING) so admin edits are never
 * overwritten. Runs idempotently on every boot via startup-migrations.ts.
 *
 * Content: 30-day devotional through John's Gospel.
 * Scripture references are stored as plain text; the frontend loads the passage
 * from the user's chosen Bible translation via /bible/read/:book/:chapter.
 */

import { db } from "@workspace/db";
import { journeyStepsTable, journeysTable } from "@workspace/db/schema";
import { eq, count } from "drizzle-orm";
import { logger } from "../lib/logger.js";

const JOURNEY_ID = "15-minutes-with-jesus";

interface DayContent {
  day: number;
  title: string;
  scripture: string;
  mentorIntro: string;
  teachingContent: string;  // → devotional on frontend
  prayer: string;            // → prayerPrompt on frontend
  todaysAction: string;      // → actionStep on frontend
}

const DAYS: DayContent[] = [
  {
    day: 1,
    title: "Come and See",
    scripture: "John 1:35-39",
    mentorIntro: "Jesus doesn't begin with a sermon. He begins with an invitation.",
    teachingContent: `Two disciples are following John the Baptist when Jesus walks by. John points and says, "Look — the Lamb of God." And they follow. When Jesus turns and sees them, he asks the simplest of questions: "What are you looking for?"

They don't have a perfect answer. They just ask, "Where are you staying?" And he says, "Come and see." This is where everything begins. Not with doctrine, not with demands — with an invitation.

You have heard something about Jesus. You are curious. You have followed this far. And this morning, he turns to you with the same question: What are you looking for? Whatever the answer, his response is the same. Come. See.`,
    prayer: `Lord, I am here. I am not sure exactly what I am looking for, but I know I am looking for you. Quiet the noise in me today. Let me hear your voice and follow it. Teach me to stay close. Amen.`,
    todaysAction: `Before anything else demands your attention, sit quietly for two minutes. Tell Jesus you are here. That is enough to begin.`,
  },
  {
    day: 2,
    title: "He Knows Your Name",
    scripture: "John 1:40-42",
    mentorIntro: "Before you can introduce yourself to Jesus, he already knows who you are.",
    teachingContent: `Andrew finds his brother Simon and brings him to Jesus. The moment Jesus sees Simon, he says: "You are Simon son of John. You will be called Cephas" — which means Peter, rock.

Jesus doesn't ask Simon to introduce himself. He already knows his name, his family, his story. And in the same moment, he gives him a new one. Jesus looks at a fisherman with all his roughness, all his unsteadiness, and sees not just who he is — but who he will become.

He sees you the same way. He knows your name, your history, and your potential, all at once. You don't have to perform. You don't have to explain yourself. He already knows.`,
    prayer: `Jesus, you know my name. You know my past and all the things I am afraid you might think less of me for. Meet me here anyway. Speak over me, as you spoke over Peter. Tell me who I am becoming. Amen.`,
    todaysAction: `Write down your name today. Underneath it, write: "Known by Jesus." Carry that with you through the day.`,
  },
  {
    day: 3,
    title: "Can Anything Good?",
    scripture: "John 1:45-51",
    mentorIntro: "Doubt is not the end of the story. It can be the beginning.",
    teachingContent: `Nathanael is sceptical. Philip tells him they've found the Messiah, and Nathanael says, "Can anything good come from Nazareth?" It is a fair question. Philip doesn't argue. He just says, "Come and see."

When Nathanael arrives, Jesus greets him as "a true Israelite in whom there is no deceit." Nathanael is stunned — how does he know me? Jesus says, "I saw you under the fig tree before Philip called you." Nathanael's doubt collapses into confession: "You are the Son of God."

Jesus didn't shame his scepticism. He met it with knowledge. Every doubt you bring to Jesus is an invitation for him to reveal himself more fully.`,
    prayer: `Lord, I admit I carry questions. I sometimes wonder if any of this is real. Meet my doubt with your presence, the way you met Nathanael. Let me see you clearly. Amen.`,
    todaysAction: `Name one honest question you have about Jesus or faith. Bring it to him directly in prayer — not to resolve it, but to offer it.`,
  },
  {
    day: 4,
    title: "The First Sign",
    scripture: "John 2:1-11",
    mentorIntro: "Jesus's first miracle is not dramatic. It is quiet, private, and about ordinary life.",
    teachingContent: `A wedding runs out of wine. Jesus's mother notices and tells him. He hesitates: "My time has not yet come." But then he acts. He tells the servants to fill six stone jars with water — huge jars, 20 to 30 gallons each. Then: draw some out and take it to the master of the banquet.

When the master tastes it, he is astonished. The best wine has been saved for last. This is the first sign of who Jesus is.

Notice: he doesn't announce it. No speech, no crowd. A quiet instruction to servants at the edge of a wedding. The glory of Jesus often shows up not in the spectacular but in the overlooked — in the ordinary concerns of ordinary people. Nothing in your everyday life is too small to bring to him.`,
    prayer: `Jesus, I bring you my ordinary today. The things I think are too small to matter. Show me your glory in the everyday. Help me notice you in the quiet places. Amen.`,
    todaysAction: `Bring one small worry or practical concern to Jesus in prayer. Tell him about it specifically — as Mary did. Then watch.`,
  },
  {
    day: 5,
    title: "Zeal for His House",
    scripture: "John 2:13-17",
    mentorIntro: "Jesus cares deeply about the places where people come to meet God.",
    teachingContent: `Jesus arrives at the temple and finds it full of merchants and money-changers. He makes a whip of cords and drives them all out. His disciples remember the words: "Zeal for your house will consume me."

Zeal — a burning, consuming passion. Jesus is angry because the place meant for prayer, for encounter with the living God, had become a marketplace.

This tells us something important: Jesus cares about the spaces where we seek God. Your heart — your inner life — is one of those places. He wants it clear and open. What noise or distraction has moved in where prayer used to be?`,
    prayer: `Lord, clear out the clutter in my heart today. The distractions that crowd out your voice, the busyness that fills the space that should be yours. I want to meet you without obstruction. Amen.`,
    todaysAction: `Identify one thing in your day that regularly crowds out time with God. Make one small decision today to protect that space.`,
  },
  {
    day: 6,
    title: "Born of the Spirit",
    scripture: "John 3:1-8",
    mentorIntro: "A late-night conversation changes everything.",
    teachingContent: `Nicodemus is a religious leader who comes to Jesus at night — privately, carefully. He begins with a compliment: "We know you are a teacher from God." Jesus cuts straight to the heart: "No one can see the kingdom of God unless they are born again."

Jesus is not talking about biology. He is talking about a new kind of life — life from the Spirit of God, not earned or inherited, but received.

"The wind blows wherever it pleases. You cannot tell where it comes from or where it is going. So it is with everyone born of the Spirit." Following Jesus is not an upgrade to your existing life. It is a new beginning. The Spirit of God making his home in you — quietly, surely, the way the wind moves: real, powerful, and beyond control.`,
    prayer: `Holy Spirit, come. I want the kind of life that only you can give — not just religion, not just effort, but you yourself living in me. Be the breath of my life today. Amen.`,
    todaysAction: `Spend three minutes breathing slowly. With each breath in, pray: "Come, Spirit." With each breath out: "I surrender." Let your body remember what your soul needs.`,
  },
  {
    day: 7,
    title: "God So Loved",
    scripture: "John 3:16-17",
    mentorIntro: "The most familiar verse in the Bible is still the most important.",
    teachingContent: `"For God so loved the world that he gave his one and only Son, that whoever believes in him shall not perish but have eternal life." We know these words. But familiarity can hollow out the wonder.

Sit with this for a moment: God loves the world. Not a tidied-up version of it. The actual world — broken, wandering, often hostile to him. He loves it so much that he gave the most precious thing he had: his Son.

And the purpose is not condemnation. "God did not send his Son into the world to condemn the world, but to save the world through him." If you feel condemned — by your failures, your past, the voice in your head — that voice is not from God. His purpose is rescue. He came to save, not to condemn. You.`,
    prayer: `Father, thank you for loving the world — for loving me. I find it hard to believe sometimes. Let these words land somewhere deeper than my head today. Let me feel your love. Amen.`,
    todaysAction: `Write out John 3:16 by hand. Slowly. Replace "the world" and "whoever" with your own name. Read it back to yourself.`,
  },
  {
    day: 8,
    title: "He Must Increase",
    scripture: "John 3:27-30",
    mentorIntro: "The most counterintuitive wisdom in the Gospels comes from a man stepping aside.",
    teachingContent: `John the Baptist's disciples are troubled. People are leaving John to follow Jesus. But John is not threatened. "The friend of the bridegroom who stands and hears him rejoices greatly at the bridegroom's voice. That joy is mine, and it is now complete. He must become greater; I must become less."

This is a life posture, not just a theology. John's entire identity is wrapped up in pointing to someone greater — and he does it with joy, not resentment.

We often struggle when someone else receives what we thought we deserved. John shows us another way: to find our completeness not in being the centre, but in proximity to the one who is. When Jesus is at the centre of your life, you don't shrink — you find your truest self.`,
    prayer: `Lord, I want you at the centre. Help me step back from needing to be seen or praised. Let my joy today come from your presence, not my performance. Amen.`,
    todaysAction: `Find one opportunity today to let someone else take the credit or the spotlight. Offer it quietly, without announcement.`,
  },
  {
    day: 9,
    title: "Living Water",
    scripture: "John 4:7-15",
    mentorIntro: "An ordinary errand becomes the most important conversation of a woman's life.",
    teachingContent: `She comes at noon, alone, to draw water. Jesus is resting at the well. He asks her for a drink. But he pushes further: "If you knew the gift of God and who it is that asks you for a drink, you would have asked him and he would have given you living water."

She is practical. The well is deep; you have nothing to draw with. How? But Jesus is not talking about the kind of water that satisfies for an hour.

"Everyone who drinks this water will be thirsty again, but whoever drinks the water I give them will never thirst. Indeed, the water I give them will become in them a spring of water welling up to eternal life." She has been drinking from other sources — and they all run dry. Jesus is offering something permanent. What have you been drinking from?`,
    prayer: `Jesus, I recognise the empty wells in my life — the things I turn to that never quite satisfy. I want what you offer. Fill me today with something that lasts. Amen.`,
    todaysAction: `Think of one thing you regularly turn to for comfort that leaves you wanting more. Name it honestly. Bring it to Jesus as an offering, not with shame, but with honesty.`,
  },
  {
    day: 10,
    title: "In Spirit and Truth",
    scripture: "John 4:21-24",
    mentorIntro: "Jesus redefines what worship actually is.",
    teachingContent: `The woman asks Jesus a religious question — where is the right place to worship? Jesus says, essentially: that's the wrong question. "A time is coming and has now come when the true worshippers will worship the Father in the Spirit and in truth, for they are the kind of worshippers the Father seeks."

The Father is seeking worshippers. Not performers. Not people in the right location with the right posture. He is looking for people who come to him honestly — in truth — and in the power of the Spirit, not just their own effort.

Worship is not primarily a church service. It is a way of living — every day, with whatever you're doing, held up as an offering to the one who is seeking you even now.`,
    prayer: `Father, I want to be a true worshipper today. Not performing. Not pretending. Help me come to you honestly, in the truth of who I am, and open to your Spirit. That is enough. Amen.`,
    todaysAction: `At some point today, in whatever you are doing — working, driving, cooking — offer it consciously to God. Simply say: "This moment is yours." That is worship.`,
  },
  {
    day: 11,
    title: "My Food",
    scripture: "John 4:31-38",
    mentorIntro: "Jesus sees a harvest that his disciples are too tired to notice.",
    teachingContent: `The disciples return with food and urge Jesus to eat. He says, "I have food to eat that you know nothing about." They think someone else has brought food. But Jesus means something deeper: "My food is to do the will of him who sent me and to finish his work."

"Open your eyes and look at the fields. They are ripe for harvest." The disciples are focused on lunch. Jesus is looking at a world ready to encounter God.

This is a revelation of what sustains Jesus. Doing the will of the Father nourishes him. When we are aligned with our purpose, when we are living in what God has called us to, there is a kind of sustenance that goes beyond the physical. Are you living in that?`,
    prayer: `Lord, let me be nourished today by your purposes. Show me the harvest around me — the people, the moments, the invitations. Give me the energy that only comes from being in your will. Amen.`,
    todaysAction: `Look around you today with the question: "Where is God already at work?" Find one person or situation that might be part of what he is doing — and pray for it.`,
  },
  {
    day: 12,
    title: "The Official's Son",
    scripture: "John 4:46-53",
    mentorIntro: "A father will do anything for his son. Jesus meets him exactly where he is.",
    teachingContent: `A royal official travels a significant distance to find Jesus. His son is dying. He begs Jesus to come. But Jesus says simply: "Go. Your son will live."

The man believes the word and turns to go. Before he reaches home, his servants meet him with the news: your son is alive. He checks the time — it matches the exact moment Jesus spoke.

This is a man who believed before he had proof. He took Jesus at his word. He turned around and went. Faith like this is not passive — it is active trust in what Jesus has said, even when you can't see the outcome yet. That is the kind of faith Jesus honours.`,
    prayer: `Jesus, I am carrying concerns for people I love. Help me take you at your word and walk forward in peace, even before I see the answer. I trust you with the ones I cannot fix myself. Amen.`,
    todaysAction: `Who are you worried about today? Write down their name and the words: "I trust Jesus with ___." Say it aloud. Let that be your act of faith.`,
  },
  {
    day: 13,
    title: "Rise and Walk",
    scripture: "John 5:5-9",
    mentorIntro: "Thirty-eight years of waiting. Jesus asks one question.",
    teachingContent: `A man has been an invalid for thirty-eight years. He lies beside a pool believed to have healing properties. Jesus sees him and asks: "Do you want to get well?"

The man's answer reveals something: he has a reason why it can't happen. "I have no one to help me." He is stuck in the story of his limitation. Jesus doesn't engage the excuse. He says, "Get up. Pick up your mat and walk." And immediately the man is healed.

Jesus doesn't wait for the man to fully believe. He gives the command. Sometimes the command comes before the experience. Sometimes you have to stand up before you feel like standing up.`,
    prayer: `Jesus, where am I lying down that you are calling me to rise? Give me the courage to stand before I feel capable. I receive your word today: get up. I will trust you with what comes next. Amen.`,
    todaysAction: `Is there an area of your life where you've been stuck in "why it can't happen"? Name it. Then ask Jesus: what one step can I take today?`,
  },
  {
    day: 14,
    title: "What the Father Does",
    scripture: "John 5:19-24",
    mentorIntro: "The relationship between Jesus and the Father is an invitation to understand your own.",
    teachingContent: `Jesus describes his relationship with the Father: "The Son can do nothing by himself; he can do only what he sees his Father doing, because whatever the Father does the Son also does. For the Father loves the Son and shows him all he does."

Jesus lives in a constant state of attention to the Father. He watches, he listens, he follows. And then this extraordinary promise: "Whoever hears my word and believes him who sent me has eternal life and will not be judged but has crossed over from death to life."

The same intimacy that Jesus has with the Father — the attentiveness, the love, the shared life — is what he is calling us into. The Father loves you. He shows you what he is doing. You are invited to join him there.`,
    prayer: `Father, teach me to live the way Jesus lived — always watching for what you are doing, always attentive to your voice. I want to be close enough to see your face. Amen.`,
    todaysAction: `Spend five minutes today simply asking: "Father, what are you doing today?" Sit with the question. Notice anything that comes to mind.`,
  },
  {
    day: 15,
    title: "The Bread of Life",
    scripture: "John 6:35-40",
    mentorIntro: "Jesus doesn't offer a product. He offers himself.",
    teachingContent: `The crowd wants more signs, more bread, more miracles. Jesus says something that must have stopped them: "I am the bread of life. Whoever comes to me will never go hungry, and whoever believes in me will never be thirsty."

He is not offering something — he is offering himself. And then he adds a promise that carries everything: "Whoever comes to me I will never drive away."

Never. No matter what you have done, where you have been, how long you have stayed away. And the deeper promise: "I shall lose none of all those he has given me, but raise them up at the last day." You are held. You will not be lost.`,
    prayer: `Jesus, I am hungry today in ways I find hard to name. Fill me with yourself. I come to you — messy, imperfect, sometimes doubting. I trust your promise that you will not turn me away. Amen.`,
    todaysAction: `Eat a meal slowly today. With each bite, remember that Jesus offers something that actually satisfies — more than food. Let the meal be a reminder.`,
  },
  {
    day: 16,
    title: "Will You Also Leave?",
    scripture: "John 6:66-69",
    mentorIntro: "The crowd thins. Jesus turns to the Twelve. The question becomes personal.",
    teachingContent: `Jesus has said hard things. Many of his followers have turned back. He turns to the Twelve: "You do not want to leave too, do you?"

Peter answers for them: "Lord, to whom shall we go? You have the words of eternal life. We have come to believe and to know that you are the Holy One of God."

This is not triumphant faith. This is honest, cornered faith. There is nowhere else to go. Everything else has been tried, or looks less true, or promises less. Peter is not saying "I have no doubts." He is saying, "I have considered the alternatives and I keep coming back to you." That is faith. Not certainty — but a settled decision that Jesus is the truest thing there is.`,
    prayer: `Lord, there are days I almost turn back. The way feels hard and I am tired. But where else would I go? You have the words of life. I choose to stay. I choose you, again, today. Amen.`,
    todaysAction: `Write down one reason you believe Jesus is who he says he is. Not a theological argument — something personal. Keep it. Come back to it on hard days.`,
  },
  {
    day: 17,
    title: "Rivers of Living Water",
    scripture: "John 7:37-39",
    mentorIntro: "Jesus stands up and cries out — not to command, but to invite.",
    teachingContent: `It is the last day of the Feast of Tabernacles. At the moment when water is poured out at the temple altar, Jesus stands and cries out: "Let anyone who is thirsty come to me and drink. Whoever believes in me, as Scripture has said, rivers of living water will flow from within them."

John tells us this refers to the Spirit. Not a trickle. Not a pool. Rivers.

When the Spirit of God takes up residence in you, the flow goes outward. You become a source of life for others, not just a recipient. The thirst in you is not a sign that something has gone wrong. It is an invitation to come to Jesus, to drink, and to discover that you have more to give than you imagined.`,
    prayer: `Holy Spirit, flow in me today. I come thirsty. Fill me until the overflow reaches others around me. I want to carry your life into my day. Amen.`,
    todaysAction: `Today, ask someone how they are — and actually listen. Let the Spirit use the next few minutes to bring refreshment to someone else through you.`,
  },
  {
    day: 18,
    title: "Light of the World",
    scripture: "John 8:12",
    mentorIntro: "Jesus makes a claim that changes everything about darkness.",
    teachingContent: `"I am the light of the world. Whoever follows me will never walk in darkness, but will have the light of life." Jesus does not say, "I bring light" or "I teach about light." He says: I am the light. He is the source, not just a guide.

Whoever follows him — walks after him, keeps pace with him — will not walk in darkness. Darkness, in John's Gospel, is more than night. It is confusion, lostness, spiritual blindness, not knowing which way to go.

If you have been walking in some kind of darkness — of mind, of direction, of grief — Jesus is making you a personal promise. Follow me, and you will have the light you need. Not a floodlight for the whole path. Just enough light for the next step.`,
    prayer: `Jesus, I need your light today. Show me the next step — just the next one. I will follow. Let your presence be the lamp I walk by. Amen.`,
    todaysAction: `When you feel uncertain about a decision today, stop and ask: "Jesus, what is the next step?" Take that one. That is walking in the light.`,
  },
  {
    day: 19,
    title: "The Truth Will Set You Free",
    scripture: "John 8:31-36",
    mentorIntro: "Freedom isn't doing whatever you want. It is becoming who you were made to be.",
    teachingContent: `Jesus says: "If you hold to my teaching, you are really my disciples. Then you will know the truth, and the truth will set you free." They push back: "We have never been slaves. We don't need to be set free." But Jesus sees what they can't see: everyone who sins is a slave to sin.

The freedom Jesus offers is not freedom from responsibility. It is freedom from what enslaves us — the patterns, the compulsions, the cycles of behaviour we hate but can't seem to break.

When you encounter truth — real, living truth in the person of Jesus — something begins to break loose inside you. You are not your patterns. You are not your worst moments. You were made for freedom.`,
    prayer: `Jesus, you are truth. Where I am bound — in my habits, my fears, my repeated failures — set me free. I can't do it myself. I need you to do what only you can do. Amen.`,
    todaysAction: `Name one area where you feel trapped. Write it down. Then write beneath it: "The Son sets me free."`,
  },
  {
    day: 20,
    title: "Before Abraham Was",
    scripture: "John 8:56-59",
    mentorIntro: "Jesus says something that changes the entire frame of who he is.",
    teachingContent: `The religious leaders are arguing with Jesus about Abraham. And Jesus says: "Very truly I tell you, before Abraham was born, I am." Not "I was" — "I am."

He is using the name of God from the burning bush: the eternal, self-existent I AM. The leaders understand exactly what he means — and pick up stones to throw at him.

He is not just a teacher, not just a prophet, not just a moral example. He is claiming to be God himself, come in the flesh, existing before all creation. This changes everything about your prayers, your struggles, your future. You are not speaking to a great religious figure. You are speaking to the one who said "I am" before time began — and who is with you right now.`,
    prayer: `Lord, you are the great I AM. Before I existed, you were. After all I know ends, you will be. Let me rest today in your eternal, unchanging presence. Amen.`,
    todaysAction: `Sit for three minutes in silence, knowing that the great I AM is present in the room with you. You don't have to say anything. Just be there, with him.`,
  },
  {
    day: 21,
    title: "The Good Shepherd",
    scripture: "John 10:11-15",
    mentorIntro: "Jesus describes himself as a shepherd — and means it with his life.",
    teachingContent: `"I am the good shepherd. The good shepherd lays down his life for the sheep." This is not a metaphor for management. Jesus is describing what he is about to do. He will actually die.

He contrasts himself with the hired hand who runs when danger comes — because the sheep belong to the employer, not to him. But Jesus says: "I know my sheep and my sheep know me — just as the Father knows me and I know the Father."

The knowledge here is intimate, personal, familial. He knows you the way the Father knows him. And he gives his life — not reluctantly, but willingly, because the sheep are his and he loves them. You are not a project. You are his.`,
    prayer: `Good Shepherd, I am yours. Remind me today that I am known, cared for, and that you laid your life down for me. Lead me in the paths you have prepared. Amen.`,
    todaysAction: `Think of one area of your life where you feel exposed or vulnerable. Tell Jesus about it, and then say: "I am your sheep. I trust you to shepherd me here."`,
  },
  {
    day: 22,
    title: "My Sheep Hear My Voice",
    scripture: "John 10:27-30",
    mentorIntro: "You were made to recognise his voice.",
    teachingContent: `"My sheep hear my voice; I know them, and they follow me. I give them eternal life, and they shall never perish; no one will snatch them out of my hand. My Father, who has given them to me, is greater than all; no one can snatch them out of my Father's hand."

Twice: no one can snatch you. You are held by Jesus, and you are held by the Father. It is a double grip of grace.

But notice how it begins: with hearing. The sheep hear the shepherd's voice. This is not automatic — it is a relationship cultivated through practice. Every morning you spend in this quiet time, you are learning to recognise his voice. Over time, when life is loud and confusing, you will recognise his call through the noise.`,
    prayer: `Jesus, tune my ear to your voice today. Help me recognise it above all the other voices competing for my attention. Let me follow you through the noise of this day. Amen.`,
    todaysAction: `When you feel pulled in multiple directions today, stop and ask: "Which of these paths sounds most like Jesus?" Trust the answer.`,
  },
  {
    day: 23,
    title: "I Am the Resurrection",
    scripture: "John 11:21-27",
    mentorIntro: "Martha comes to Jesus in grief. He meets her with something more than comfort.",
    teachingContent: `Lazarus has been dead for four days. Martha runs to meet Jesus: "Lord, if you had been here, my brother would not have died." There is grief in that — and maybe some accusation. But also faith: "Even now I know that God will give you whatever you ask."

Jesus says, "I am the resurrection and the life. The one who believes in me will live, even though they die." He doesn't give her a theological lecture. He gives her himself.

"I am the resurrection" — not "I bring resurrection," not "I can arrange resurrection." He is the resurrection. Whatever you are grieving — whatever feels dead and beyond recovery — Jesus stands before it and says: I am the life.`,
    prayer: `Jesus, I bring you the places in my life that feel dead — hopes that have faded, relationships that have broken, dreams I have stopped dreaming. You are the resurrection. Speak life. Amen.`,
    todaysAction: `Name something that feels beyond recovery. Write it down. Then write beside it: "Jesus is the resurrection." Pray over it today.`,
  },
  {
    day: 24,
    title: "Jesus Wept",
    scripture: "John 11:33-37",
    mentorIntro: "The shortest verse in the Bible contains a world of meaning.",
    teachingContent: `Mary falls at Jesus's feet, weeping. The mourners around her are weeping. And the text says Jesus "groaned in his spirit and was troubled." And then: "Jesus wept."

He is about to raise Lazarus. He knows the end of the story. And he weeps anyway. He weeps with them, in their grief, in their pain, without rushing past it to the miracle.

This tells us something essential about Jesus: he does not stand at a distance from our suffering. He enters it. He is moved by our tears. When you grieve, you do not grieve alone. The God of the universe has wept. He weeps with you. He sees your sorrow, and he is troubled by it. And then he acts.`,
    prayer: `Jesus, thank you for weeping. Thank you that I do not have to pretend to be okay with you. Sit with me in the hard things today. I trust that you see, and that you act, and that you care. Amen.`,
    todaysAction: `Take two minutes to sit with a grief you have been pushing away. You don't have to fix it. Just bring it honestly to Jesus and let him be there with you.`,
  },
  {
    day: 25,
    title: "Lazarus, Come Out",
    scripture: "John 11:41-44",
    mentorIntro: "Death gets the last word about everything — until Jesus speaks.",
    teachingContent: `They roll the stone away. Jesus prays — openly, gratefully — and then, in a loud voice: "Lazarus, come out!" And the dead man comes out, wrapped in burial cloths.

Jesus's first instruction after the miracle is: "Take off the grave clothes and let him go." Lazarus walked out. And the people around him are told: take the old wrappings off. Let him be free.

This matters. Sometimes we are raised — something in us comes back to life — but we are still wrapped in who we used to be. Jesus does two works: he raises the dead, and then he calls the community to help remove what no longer fits. You are not that person anymore.`,
    prayer: `Jesus, raise what is dead in me. And when you do, give the people around me grace to help remove the grave clothes — to let me be who I am becoming, not who I was. Amen.`,
    todaysAction: `Ask someone you trust: "Is there anything you see in me that no longer fits who I am?" Be open to the answer.`,
  },
  {
    day: 26,
    title: "A Grain of Wheat",
    scripture: "John 12:23-26",
    mentorIntro: "The paradox at the centre of Christian life: you have to lose it to find it.",
    teachingContent: `"Unless a grain of wheat falls to the ground and dies, it remains only a single seed. But if it dies, it produces many seeds. Anyone who loves their life will lose it, while anyone who hates their life in this world will keep it for eternal life."

Jesus is talking about himself — about the cross that is coming. But he extends the pattern to his followers. The willingness to let go — of control, of self-preservation, of the life we have planned — is what opens the door to something far larger.

A seed that is never planted remains a seed. It is only when it falls into the ground and seems to disappear that it becomes what it was always meant to be. What is God asking you to plant?`,
    prayer: `Lord, I confess my grip on my own life. The plans I hold too tightly, the outcomes I try to control. I want to be a seed, not a hoarder of seeds. Help me trust the ground you are planting me in. Amen.`,
    todaysAction: `Identify something you are holding tightly — a plan, a relationship, an outcome. Open your hands in prayer today and say: "Lord, I offer this back to you."`,
  },
  {
    day: 27,
    title: "The Way, the Truth, the Life",
    scripture: "John 14:5-7",
    mentorIntro: "The disciples are troubled. Jesus tells them the one thing they need to know.",
    teachingContent: `Thomas says, "Lord, we don't know where you are going, so how can we know the way?" He is honest about his confusion. And Jesus gives what may be the most comprehensive answer he ever gives: "I am the way and the truth and the life. No one comes to the Father except through me."

Three things, all wrapped in a person: the way — not a map, but a companion for the journey. The truth — not a doctrine, but a living person who embodies reality. The life — not an improved version of your current existence, but actual, eternal life that begins now.

You don't need to find the right path before you can walk. You need to walk with Jesus — and he is the path.`,
    prayer: `Jesus, you are the way. When I don't know which direction to go, help me to look at you — not at the road ahead. Lead me. If I stay close to you, I will arrive where I need to be. Amen.`,
    todaysAction: `When you face uncertainty today, pause and ask: "What would staying close to Jesus look like here?" Do that thing.`,
  },
  {
    day: 28,
    title: "Abide in Me",
    scripture: "John 15:4-8",
    mentorIntro: "The invitation of the Christian life is simpler than we make it.",
    teachingContent: `"Abide in me, as I also abide in you. No branch can bear fruit by itself; it must remain in the vine. Neither can you bear fruit unless you remain in me."

Jesus is not asking for impressive performance. He is asking for attachment. A branch does not strain to produce grapes. It stays connected to the vine, and fruit comes naturally from that connection.

This is the secret of spiritual fruitfulness — not trying harder, but staying closer. What does it mean to abide? To remain. To keep coming back. To choose, every morning, to stay connected. The branch does not worry about production. It trusts the vine. You don't have to produce a life worthy of Jesus. You have to remain attached to the one who is already producing it in you.`,
    prayer: `Jesus, I want to abide. To remain in you throughout the ordinary moments of today. Keep me connected to you. Let what you produce in me be far better than anything I could manufacture. Amen.`,
    todaysAction: `Set a reminder on your phone for midday. When it goes off, take sixty seconds to reconnect with Jesus. That is what abiding looks like in practice.`,
  },
  {
    day: 29,
    title: "Greater Love",
    scripture: "John 15:12-17",
    mentorIntro: "Jesus redefines love with the most extreme example possible.",
    teachingContent: `"Greater love has no one than this: to lay down one's life for one's friends. You are my friends if you do what I command. I no longer call you servants, because a servant does not know his master's business. Instead, I have called you friends."

He does not call us servants. He calls us friends. And the mark of this friendship is that he has let us in on the story — on what the Father is doing. He has chosen us.

"You did not choose me, but I chose you and appointed you so that you might go and bear fruit — fruit that will last." You are not a servant performing for approval. You are a friend who has been chosen, trusted, and commissioned. And the love holding this together is the kind that goes all the way to death.`,
    prayer: `Jesus, thank you for calling me friend. I want to live from that place — chosen, loved, trusted — not always striving for approval. Let me carry the confidence of your friendship into my day. Amen.`,
    todaysAction: `Tell one person in your life today: "I'm glad you're in my life." You don't have to explain why. Just say it.`,
  },
  {
    day: 30,
    title: "It Is Finished",
    scripture: "John 19:28-30",
    mentorIntro: "Three words that change everything that has ever felt unfinished in you.",
    teachingContent: `Jesus, knowing that everything was now complete, bowed his head and gave up his spirit. The final word from the cross: "It is finished."

In Greek, tetelestai — a single word meaning paid in full, completed, accomplished. It was a word used on receipts to mark a debt as settled. Every debt you have carried — every failure, every falling short, every thing you feared God could not forgive — it is settled. Not suppressed, not overlooked. Finished. Paid. Complete.

This is where thirty days of walking with Jesus arrives: at the moment that makes it all possible. The cross is not the end of the story — the resurrection follows. But before the stone rolls away, stand here for a moment. Let the word fall over you. It is finished. You are free.`,
    prayer: `Lord Jesus, thank you. For the cross. For the cost you paid. For finishing what I could never finish on my own. I receive it today — not as doctrine, but as gift. It is finished. I am yours. Amen.`,
    todaysAction: `Finish this journey by beginning your next day. Come back tomorrow. The rhythm continues — because he is risen, and the story is not over.`,
  },
];

export async function seedDailyRhythm(): Promise<void> {
  try {
    // Count how many days already exist to avoid unnecessary work
    const [{ value: existingCount }] = await db
      .select({ value: count() })
      .from(journeyStepsTable)
      .where(eq(journeyStepsTable.journeyId, JOURNEY_ID));

    if (Number(existingCount) >= DAYS.length) {
      logger.info(`Daily rhythm seed: ${existingCount} days already present (skipping insert)`);
      // Still ensure durationDays is correct
      await db
        .update(journeysTable)
        .set({ durationDays: DAYS.length })
        .where(eq(journeysTable.id, JOURNEY_ID));
      return;
    }

    // Upsert all days — DO NOTHING on conflict so admin edits are preserved
    await db
      .insert(journeyStepsTable)
      .values(
        DAYS.map((d) => ({
          journeyId: JOURNEY_ID,
          day: d.day,
          title: d.title,
          scripture: d.scripture,
          mentorIntro: d.mentorIntro,
          teachingContent: d.teachingContent,
          prayer: d.prayer,
          todaysAction: d.todaysAction,
          status: "published",
          estimatedReadingTime: 10,
        }))
      )
      .onConflictDoNothing();

    // Update journey to reflect 30 days authored
    await db
      .update(journeysTable)
      .set({ durationDays: DAYS.length })
      .where(eq(journeysTable.id, JOURNEY_ID));

    logger.info(`Daily rhythm seed: inserted ${DAYS.length} days for '${JOURNEY_ID}'`);
  } catch (err) {
    logger.warn({ err }, "Daily rhythm seed: failed (non-fatal)");
  }
}

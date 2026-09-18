/**
 * seed-walk.mjs — seeds "The Road to Emmaus" growth walk for launch testing.
 * Usage: node artifacts/api-server/scripts/seed-walk.mjs
 */
import { createRequire } from 'module';
const require = createRequire('/home/runner/workspace/package.json');
const { Pool } = require('/home/runner/workspace/node_modules/.pnpm/pg@8.22.0/node_modules/pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const JOURNEY_ID = 'the-road-to-emmaus';

// Upsert journey
await pool.query(
  `INSERT INTO journeys (id, title, subtitle, description, journey_type, status, duration_days, estimated_duration, published_at)
   VALUES ($1,$2,$3,$4,'growth','Published',3,'10 min/day',now())
   ON CONFLICT (id) DO UPDATE SET status='Published', published_at=COALESCE(journeys.published_at,now())`,
  [
    JOURNEY_ID,
    'The Road to Emmaus',
    'A 3-day walk through Luke 24',
    'Walk the road to Emmaus alongside the two disciples who did not recognise Jesus — and discover how he opens the Scriptures, meets us in our grief, and reveals himself in the breaking of bread.',
  ]
);
console.log('Journey upserted:', JOURNEY_ID);

const steps = [
  {
    day: 1,
    title: 'Walking in the Dark',
    scripture: 'Luke 24:13-16',
    teaching:
      'Two disciples were walking away from Jerusalem — away from hope. Cleopas and his companion had seen Jesus crucified, and now the tomb was empty. They had heard reports of resurrection, but it all seemed like an idle tale.\n\nJesus joined them on the road. He walked beside them. He asked them questions. He listened. And they did not recognise him.\n\nSometimes our grief or confusion is so great that we walk right past the presence of Jesus. He is with us on the road even when we cannot see him. He does not abandon us in our confusion — he enters it.',
    reflection:
      'When have you found yourself walking away from hope? What did God\'s presence look like in that season, even if you did not recognise it at the time?',
    prayer: 'Lord Jesus, open my eyes to see you walking beside me today — even in the places that feel most confusing or broken. Amen.',
    action: 'Take a short walk today. As you walk, bring one unanswered question or grief to God and simply tell him where you are.',
  },
  {
    day: 2,
    title: 'When Scripture Burns',
    scripture: 'Luke 24:25-27',
    teaching:
      'Jesus, still unrecognised, turned to the two disciples and did something extraordinary: he opened the Scriptures. Beginning with Moses and all the Prophets, he interpreted to them in all the Scriptures the things concerning himself.\n\nThe Bible was not a collection of moral lessons or historical records — it was a story, and Jesus was its centre. Every promise, every sacrifice, every rescue was pointing forward to this moment.\n\nThe disciples later said their hearts burned within them as he spoke. That burning is the Holy Spirit at work, making Scripture come alive.',
    reflection:
      'Which part of the Bible feels most alive to you at the moment — and which part feels most distant? Bring both to God today.',
    prayer: 'Open the Scriptures to me, Lord. Let my heart burn as yours did on the road. Show me how everything points to you. Amen.',
    action: 'Read Luke 24:13-35 in full today. Notice every time the disciples understanding shifts. What changes for them — and why?',
  },
  {
    day: 3,
    title: 'Known in the Breaking',
    scripture: 'Luke 24:28-35',
    teaching:
      'They reached the village. Jesus acted as though he were going further. But they urged him: stay with us, for it is nearly evening. And he went in to stay with them.\n\nAt table, Jesus took bread, blessed it, broke it, and gave it to them. And their eyes were opened. They recognised him — and he vanished from their sight.\n\nJesus is known in the breaking. In the ordinary act of sharing bread, in the moment of communion, in the everyday table of life — he reveals himself. And the moment they recognised him, they immediately got up and returned to Jerusalem. Encountering the risen Jesus changes the direction of your life.',
    reflection:
      'Where has Jesus made himself known to you through something ordinary — a meal, a conversation, a moment you almost missed?',
    prayer: 'Thank you, Jesus, that you reveal yourself in the breaking. Open my eyes to recognise you in the everyday moments of my life. Amen.',
    action: 'Share a meal with someone today — family, a friend, a neighbour — and pray before you eat, asking God to make himself known at your table.',
  },
];

for (const s of steps) {
  const existing = await pool.query(
    'SELECT id FROM journey_steps WHERE journey_id=$1 AND day=$2',
    [JOURNEY_ID, s.day]
  );
  if (existing.rows.length > 0) {
    await pool.query(
      `UPDATE journey_steps SET title=$1, scripture=$2, teaching_content=$3,
       reflection_question=$4, prayer=$5, todays_action=$6, status='Published', updated_at=now()
       WHERE journey_id=$7 AND day=$8`,
      [s.title, s.scripture, s.teaching, s.reflection, s.prayer, s.action, JOURNEY_ID, s.day]
    );
  } else {
    await pool.query(
      `INSERT INTO journey_steps (journey_id, day, title, scripture, teaching_content, reflection_question, prayer, todays_action, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Published')`,
      [JOURNEY_ID, s.day, s.title, s.scripture, s.teaching, s.reflection, s.prayer, s.action]
    );
  }
  console.log(`  Day ${s.day}: ${s.title}`);
}

// Sync durationDays
await pool.query(
  `UPDATE journeys SET duration_days=(SELECT COUNT(*) FROM journey_steps WHERE journey_id=$1 AND status='Published'), updated_at=now() WHERE id=$1`,
  [JOURNEY_ID]
);

// Verify
const check = await pool.query(
  `SELECT j.id, j.title, j.journey_type, j.status, j.duration_days,
    (SELECT COUNT(*) FROM journey_steps WHERE journey_id=j.id AND status='Published') pub_steps
   FROM journeys j WHERE j.id=$1`,
  [JOURNEY_ID]
);
console.log('\nResult:', JSON.stringify(check.rows[0], null, 2));
await pool.end();

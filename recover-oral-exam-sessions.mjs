import fs from 'node:fs';

const envText = fs.readFileSync('.env.local', 'utf8');
const env = (name) => {
  const match = envText.match(new RegExp(`^${name}=(.*)$`, 'm'));
  return match?.[1]?.trim() || '';
};

const SUPABASE_URL = env('VITE_SUPABASE_URL');
const SERVICE_KEY = env('Supabase_Service_Role_Key');
const ELEVENLABS_API_KEY = env('ELEVENLABS_API_KEY');
const OPENAI_API_KEY = env('openai_key');
const OPENAI_MODEL = 'gpt-4.1';

const headersJson = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

const evaluationSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    overall_score_pct: { type: 'integer', minimum: 0, maximum: 100 },
    passed: { type: 'boolean' },
    summary: { type: 'string' },
    topic_scores: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          topic: { type: 'string' },
          score_pct: { type: 'integer', minimum: 0, maximum: 100 },
          comment: { type: 'string' },
        },
        required: ['topic', 'score_pct', 'comment'],
      },
    },
    answer_evaluations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          question: { type: 'string' },
          candidate_answer: { type: 'string' },
          score_pct: { type: 'integer', minimum: 0, maximum: 100 },
          verdict: { type: 'string', enum: ['correct', 'partial', 'wrong'] },
          recommendation: { type: 'string' },
        },
        required: ['question', 'candidate_answer', 'score_pct', 'verdict', 'recommendation'],
      },
    },
    strengths: { type: 'array', items: { type: 'string' } },
    gaps: { type: 'array', items: { type: 'string' } },
    model_answers: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          scenario: { type: 'string' },
          musterantwort: { type: 'string' },
        },
        required: ['scenario', 'musterantwort'],
      },
    },
    roter_faden: { type: 'array', items: { type: 'string' } },
    next_step: { type: 'string' },
  },
  required: [
    'overall_score_pct',
    'passed',
    'summary',
    'topic_scores',
    'answer_evaluations',
    'strengths',
    'gaps',
    'model_answers',
    'roter_faden',
    'next_step',
  ],
};

function extractOpenAIText(data) {
  if (typeof data?.output_text === 'string') return data.output_text;
  const chunks = [];
  for (const item of data?.output ?? []) {
    for (const content of item?.content ?? []) {
      const text = content?.text ?? content?.output_text;
      if (typeof text === 'string') chunks.push(text);
    }
  }
  return chunks.join('');
}

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

async function getSessions() {
  const url = `${SUPABASE_URL}/rest/v1/oral_exam_sessions?select=*&or=(status.eq.aborted,status.eq.running,status.eq.evaluation_failed)&transcript=is.null&order=created_at.desc&limit=20`;
  return getJson(url, headersJson);
}

async function getConversations() {
  const out = [];
  let cursor = '';
  for (let page = 0; page < 5; page++) {
    const url = new URL('https://api.elevenlabs.io/v1/convai/conversations');
    url.searchParams.set('page_size', '100');
    if (cursor) url.searchParams.set('cursor', cursor);
    const data = await getJson(url.toString(), { 'xi-api-key': ELEVENLABS_API_KEY });
    out.push(...(data.conversations ?? []));
    if (!data.has_more || !data.next_cursor) break;
    cursor = data.next_cursor;
  }
  return out.filter((c) => (c.agent_name || '').includes('34a'));
}

function matchConversation(session, conversations) {
  const created = Date.parse(session.created_at) / 1000;
  return conversations
    .map((c) => ({ c, delta: Math.abs((c.start_time_unix_secs ?? 0) - created) }))
    .filter(({ c, delta }) => delta <= 180 && (c.message_count ?? 0) > 0)
    .sort((a, b) => a.delta - b.delta)[0]?.c ?? null;
}

async function getConversation(conversationId) {
  return getJson(`https://api.elevenlabs.io/v1/convai/conversations/${conversationId}`, {
    'xi-api-key': ELEVENLABS_API_KEY,
  });
}

function normalizeTranscript(rawTranscript) {
  return (rawTranscript ?? [])
    .map((t) => ({
      role: t.role === 'agent' ? 'examiner' : 'candidate',
      text: String(t.message ?? t.text ?? '').trim(),
    }))
    .filter((t) => t.text.length > 0);
}

async function uploadAudio(conversationId, userId, sessionId) {
  const audioRes = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${conversationId}/audio`, {
    headers: { 'xi-api-key': ELEVENLABS_API_KEY },
  });
  if (!audioRes.ok) return null;
  const bytes = await audioRes.arrayBuffer();
  if (!bytes.byteLength) return null;
  const path = `${userId}/${sessionId}.mp3`;
  const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/oral-exam-audio/${path}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'audio/mpeg',
      'x-upsert': 'true',
    },
    body: bytes,
  });
  return uploadRes.ok ? path : null;
}

async function evaluateTranscript(transcript) {
  const transcriptText = transcript
    .map((t) => (t.role === 'examiner' ? 'PRÜFER: ' : 'PRÜFLING: ') + t.text)
    .join('\n');
  const prompt = [
    'Du bist ein erfahrener IHK-Prüfer der mündlichen §34a-Sachkundeprüfung (Bewachungsgewerbe).',
    'Bewerte das folgende Transkript einer mündlichen Prüfungssimulation FAIR, aber nach echten IHK-Maßstäben.',
    'Bestehensgrenze: 50 %. Bewerte nicht nur Faktenwissen, sondern auch Praxis-Angemessenheit, Deeskalations-Haltung, Struktur und Begründung der Antworten.',
    '',
    'TRANSKRIPT:',
    transcriptText,
    '',
    'Regeln: answer_evaluations enthält genau eine Zeile pro echter Prüferfrage, verdict ist correct|partial|wrong, passed ist konsistent mit overall_score_pct.',
  ].join('\n');

  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: [
        { role: 'system', content: 'Antworte ausschließlich mit JSON im vorgegebenen Schema.' },
        { role: 'user', content: prompt },
      ],
      max_output_tokens: 8192,
      temperature: 0.3,
      text: {
        format: {
          type: 'json_schema',
          name: 'oral_exam_evaluation',
          schema: evaluationSchema,
          strict: true,
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const text = extractOpenAIText(await res.json());
  const evaluation = JSON.parse(text);
  const overall = Math.max(0, Math.min(100, Math.round(evaluation.overall_score_pct)));
  return { ...evaluation, overall_score_pct: overall, passed: overall >= 50 };
}

async function updateSession(session, transcript, evaluation, audioPath) {
  const feedback = {
    summary: evaluation.summary ?? '',
    strengths: evaluation.strengths ?? [],
    gaps: evaluation.gaps ?? [],
    answer_evaluations: evaluation.answer_evaluations ?? [],
    model_answers: evaluation.model_answers ?? [],
    roter_faden: evaluation.roter_faden ?? [],
    next_step: evaluation.next_step ?? '',
    recovered: true,
  };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/oral_exam_sessions?id=eq.${session.id}`, {
    method: 'PATCH',
    headers: { ...headersJson, Prefer: 'return=minimal' },
    body: JSON.stringify({
      status: 'done',
      ended_at: session.ended_at ?? new Date().toISOString(),
      duration_s: session.duration_s ?? null,
      transcript,
      overall_score_pct: evaluation.overall_score_pct,
      passed: evaluation.passed,
      topic_scores: evaluation.topic_scores ?? [],
      feedback,
      audio_path: audioPath,
    }),
  });
  if (!res.ok) throw new Error(`Supabase update ${res.status}: ${await res.text()}`);
}

const sessions = await getSessions();
const conversations = await getConversations();
let recovered = 0;

for (const session of sessions) {
  const match = matchConversation(session, conversations);
  if (!match) {
    console.log(`skip ${session.id}: no conversation match`);
    continue;
  }
  try {
    const conversation = await getConversation(match.conversation_id);
    const transcript = normalizeTranscript(conversation.transcript);
    if (transcript.length === 0) {
      console.log(`skip ${session.id}: empty transcript`);
      continue;
    }
    const audioPath = await uploadAudio(match.conversation_id, session.user_id, session.id);
    const evaluation = await evaluateTranscript(transcript);
    await updateSession(session, transcript, evaluation, audioPath);
    recovered += 1;
    console.log(`recovered ${session.id}: ${evaluation.overall_score_pct}% audio=${audioPath ? 'yes' : 'no'}`);
  } catch (error) {
    console.log(`failed ${session.id}: ${error.message}`);
  }
}

console.log(`done recovered=${recovered}`);

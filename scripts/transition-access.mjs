import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

const actionAliases = {
  'dry-run': 'dry_run',
  dry_run: 'dry_run',
  apply: 'apply',
  status: 'status',
};

function readArgs() {
  const args = process.argv.slice(2);
  const rawAction = args[0] || 'dry-run';
  const action = actionAliases[rawAction];
  if (!action) {
    throw new Error(`Unsupported action "${rawAction}". Use dry-run, apply, or status.`);
  }

  const options = { action };
  for (const arg of args.slice(1)) {
    if (arg.startsWith('--cutoff=')) options.cutoffAt = arg.slice('--cutoff='.length);
    else if (arg.startsWith('--grant-days=')) options.grantDays = Number(arg.slice('--grant-days='.length));
    else if (arg.startsWith('--min-questions=')) options.minQuestions = Number(arg.slice('--min-questions='.length));
    else if (arg.startsWith('--min-active-days=')) options.minActiveDays = Number(arg.slice('--min-active-days='.length));
  }

  return options;
}

function requiredEnv(name, fallbackName) {
  const value = process.env[name] || (fallbackName ? process.env[fallbackName] : '');
  if (!value || !value.trim()) {
    throw new Error(`Missing required env var: ${name}${fallbackName ? ` or ${fallbackName}` : ''}`);
  }
  return value.trim();
}

async function main() {
  const body = readArgs();
  const supabaseUrl = requiredEnv('SUPABASE_URL', 'VITE_SUPABASE_URL').replace(/\/$/, '');
  const apiKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
  const secret = requiredEnv('TRANSITION_ACCESS_SECRET');
  const endpoint = `${supabaseUrl}/functions/v1/transition-access`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      'x-transition-secret': secret,
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (_) {
    throw new Error(`Function returned non-JSON (${response.status}): ${text.slice(0, 500)}`);
  }

  console.log(JSON.stringify(parsed, null, 2));

  if (!response.ok || parsed.ok === false) {
    throw new Error(parsed.error || `Function failed with status ${response.status}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

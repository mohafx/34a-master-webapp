import fs from 'fs';
import path from 'path';

// Parse .env file
const envPath = path.resolve('.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    const key = match[1];
    let val = match[2] || '';
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1);
    }
    if (val.startsWith("'") && val.endsWith("'")) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
});

console.log("Parsed Env Variables:");
console.log("- VITE_SUPABASE_URL:", env.VITE_SUPABASE_URL);
console.log("- VITE_SUPABASE_ANON_KEY:", env.VITE_SUPABASE_ANON_KEY ? 'Present (length: ' + env.VITE_SUPABASE_ANON_KEY.length + ')' : 'Missing');
console.log("- Supabase_Service_Role_Key:", env.Supabase_Service_Role_Key ? 'Present (length: ' + env.Supabase_Service_Role_Key.length + ')' : 'Missing');
console.log("- STRIPE_SECRET_KEY:", env.STRIPE_SECRET_KEY ? 'Present (length: ' + env.STRIPE_SECRET_KEY.length + ')' : 'Missing');

async function testSupabase() {
  console.log("\n--- Testing Supabase Connection ---");
  const url = env.VITE_SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY;
  const serviceKey = env.Supabase_Service_Role_Key;

  if (!url) {
    console.error("❌ VITE_SUPABASE_URL is missing!");
    return;
  }

  // 1. Test Anon Key
  if (anonKey) {
    try {
      console.log("Testing Anon Key against REST API...");
      const res = await fetch(`${url}/rest/v1/`, {
        headers: {
          'apikey': anonKey,
          'Authorization': `Bearer ${anonKey}`
        }
      });
      if (res.ok) {
        console.log("✅ Supabase REST API connection with Anon Key successful!");
      } else {
        console.error(`❌ Supabase REST API with Anon Key returned status ${res.status}: ${await res.text()}`);
      }
    } catch (e) {
      console.error("❌ Supabase REST API with Anon Key failed with error:", e.message);
    }
  } else {
    console.log("⚠️ VITE_SUPABASE_ANON_KEY is missing!");
  }

  // 2. Test Service Role Key
  if (serviceKey) {
    try {
      console.log("Testing Service Role Key against REST API...");
      const res = await fetch(`${url}/rest/v1/`, {
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`
        }
      });
      if (res.ok) {
        console.log("✅ Supabase REST API connection with Service Role Key successful!");
      } else {
        console.error(`❌ Supabase REST API with Service Role Key returned status ${res.status}: ${await res.text()}`);
      }
    } catch (e) {
      console.error("❌ Supabase REST API with Service Role Key failed with error:", e.message);
    }
  } else {
    console.log("⚠️ Supabase_Service_Role_Key is missing!");
  }
}

async function testStripe() {
  console.log("\n--- Testing Stripe Connection ---");
  const stripeKey = env.STRIPE_SECRET_KEY;

  if (!stripeKey) {
    console.error("❌ STRIPE_SECRET_KEY is missing!");
    return;
  }

  try {
    console.log("Testing STRIPE_SECRET_KEY against Stripe API...");
    const res = await fetch('https://api.stripe.com/v1/balance', {
      headers: {
        'Authorization': `Bearer ${stripeKey}`
      }
    });
    const data = await res.json();
    if (res.ok) {
      console.log("✅ Stripe API connection successful!");
      console.log(`- Mode: ${data.livemode ? 'LIVE' : 'TEST'}`);
      console.log(`- Available Balance:`, JSON.stringify(data.available));
    } else {
      console.error(`❌ Stripe API returned status ${res.status}:`, JSON.stringify(data.error || data));
    }
  } catch (e) {
    console.error("❌ Stripe API failed with error:", e.message);
  }
}

async function run() {
  await testSupabase();
  await testStripe();
}

run().catch(console.error);

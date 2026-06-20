import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.Supabase_Service_Role_Key || process.env.SUPABASE_SERVICE_ROLE_KEY;
const resendApiKey = process.env.resend_API_KEY || process.env.RESEND_API_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Missing Supabase URL or Service Role Key in environment variables.');
  process.exit(1);
}

if (!resendApiKey) {
  console.error('❌ Missing Resend API Key (resend_API_KEY) in environment variables.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// HTML Email Template Generator
function generateEmailHtml(email: string, displayName?: string, appUrl: string = 'https://app.34a-master.de') {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mündliche Prüfungssimulation - 34a Master</title>
  <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">
  <style>
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background-color: #f4f5f7;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      background-color: #f4f5f7;
      padding: 40px 0;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
    }
    .header {
      background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
      padding: 32px 30px;
      text-align: left;
      color: #ffffff;
      position: relative;
    }
    .logo-text {
      font-size: 24px;
      font-weight: 800;
      color: #ffffff;
      letter-spacing: -0.5px;
      margin: 0;
    }
    .header-subtitle {
      font-size: 14px;
      color: #bfdbfe;
      margin-top: 4px;
      font-weight: 500;
    }
    .content {
      padding: 40px 30px;
      color: #374151;
      line-height: 1.6;
    }
    .title-row {
      margin-bottom: 24px;
    }
    .title-row h1 {
      color: #111827;
      font-size: 22px;
      font-weight: 800;
      margin: 0;
      letter-spacing: -0.5px;
      display: inline-block;
      vertical-align: middle;
    }
    .badge-new {
      display: inline-block;
      background-color: #e0e7ff;
      color: #4f46e5;
      font-size: 10px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-left: 8px;
      vertical-align: middle;
    }
    .greeting {
      font-size: 16px;
      color: #111827;
      font-weight: 600;
      margin-bottom: 16px;
    }
    .intro-text {
      font-size: 15px;
      color: #4b5563;
      margin-bottom: 24px;
    }
    .feature-list {
      margin: 24px 0;
    }
    .feature-card {
      background-color: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 18px;
      margin-bottom: 16px;
      display: table;
      width: 100%;
      box-sizing: border-box;
    }
    .feature-icon-cell {
      display: table-cell;
      vertical-align: top;
      width: 44px;
    }
    .feature-content-cell {
      display: table-cell;
      vertical-align: top;
      padding-left: 14px;
    }
    .feature-icon-circle {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      text-align: center;
      line-height: 36px;
      display: inline-block;
    }
    .material-icons {
      font-family: 'Material Icons';
      font-weight: normal;
      font-style: normal;
      font-size: 20px;
      line-height: 36px;
      display: inline-block;
      text-transform: none;
      letter-spacing: normal;
      word-wrap: normal;
      white-space: nowrap;
      direction: ltr;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
      -moz-osx-font-smoothing: grayscale;
      font-feature-settings: 'liga';
      vertical-align: middle;
    }
    .icon-blue {
      background-color: #dbeafe;
      color: #2563eb;
    }
    .icon-green {
      background-color: #d1fae5;
      color: #059669;
    }
    .icon-purple {
      background-color: #f3e8ff;
      color: #7c3aed;
    }
    .feature-title {
      font-size: 16px;
      font-weight: 700;
      color: #111827;
      margin: 0 0 4px 0;
    }
    .feature-desc {
      font-size: 14px;
      color: #6b7280;
      margin: 0;
      line-height: 1.5;
    }
    .info-box {
      background-color: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 12px;
      padding: 16px;
      margin: 28px 0;
      font-size: 14px;
      color: #1e40af;
      line-height: 1.5;
    }
    .cta-container {
      text-align: center;
      margin: 32px 0 12px 0;
    }
    .cta-button {
      display: inline-block;
      background-color: #2563eb;
      color: #ffffff !important;
      font-weight: 700;
      text-decoration: none;
      padding: 14px 32px;
      border-radius: 12px;
      font-size: 15px;
      box-shadow: 0 4px 10px rgba(37, 99, 235, 0.2);
    }
    .footer {
      background-color: #f9fafb;
      padding: 30px;
      text-align: center;
      font-size: 12px;
      color: #6b7280;
      border-top: 1px solid #e5e7eb;
      line-height: 1.6;
    }
    .footer a {
      color: #2563eb;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <div class="logo-text">34a Master</div>
        <div class="header-subtitle">Prüfungsvorbereitung Sachkunde nach §34a GewO</div>
      </div>
      <div class="content">
        <div class="title-row">
          <h1>Mündliche Prüfungssimulation</h1>
          <span class="badge-new">Neu</span>
        </div>
        
        <p class="greeting">Hallo,</p>
        <p class="intro-text">wir haben ein neues, interaktives Lernangebot gestartet, um deine Vorbereitung auf die Sachkundeprüfung noch gezielter zu unterstützen. Ab sofort kannst du die mündliche Prüfung unter realistischen Bedingungen in unserer neuen KI-Simulation trainieren:</p>
        
        <div class="feature-list">
          <div class="feature-card">
            <div class="feature-icon-cell">
              <span class="feature-icon-circle icon-blue"><span class="material-icons">mic</span></span>
            </div>
            <div class="feature-content-cell">
              <h3 class="feature-title">Sprechen statt Tippen</h3>
              <p class="feature-desc">Nutze dein Mikrofon und führe ein direktes Gespräch mit unserem Prüfer Herrn Müller. Er stellt dir praxisnahe Fallbeispiele und reagiert flexibel auf deine Antworten.</p>
            </div>
          </div>
          
          <div class="feature-card">
            <div class="feature-icon-cell">
              <span class="feature-icon-circle icon-green"><span class="material-icons">check_circle</span></span>
            </div>
            <div class="feature-content-cell">
              <h3 class="feature-title">Auswertung nach IHK-Maßstäben</h3>
              <p class="feature-desc">Direkt nach dem Gespräch erhältst du einen IHK-Score, eine Stärken- und Lückenanalyse sowie detaillierte Musterlösungen zu allen gestellten Fragen.</p>
            </div>
          </div>
          
          <div class="feature-card">
            <div class="feature-icon-cell">
              <span class="feature-icon-circle icon-purple"><span class="material-icons">volume_up</span></span>
            </div>
            <div class="feature-content-cell">
              <h3 class="feature-title">Audio-Wiedergabe und Feedback</h3>
              <p class="feature-desc">Höre dir die Tonaufnahme deiner gesamten Prüfungssimulation noch einmal an, um deinen roten Faden und dein Fachvokabular gezielt zu analysieren.</p>
            </div>
          </div>
        </div>

        <div class="info-box">
          Als registrierter Nutzer kannst du eine Mini-Simulation kostenfrei absolvieren. Premium-Mitglieder erhalten in jedem Abrechnungszeitraum Zugriff auf 10 vollständige Prüfungssimulationen.
        </div>

        <div class="cta-container">
          <a href="${appUrl}/#/oral-exam" class="cta-button" target="_blank">Simulation kostenlos starten &rarr;</a>
        </div>
      </div>
      <div class="footer">
        <p>Erfolgreich lernen mit 34a Master.<br>Diese E-Mail wurde an ${email} gesendet.</p>
        <p>© 2026 34a Master. Alle Rechte vorbehalten.</p>
        <p><a href="https://fcwyavxxcblcbdezobgz.supabase.co/functions/v1/unsubscribe-user?email=${email}" target="_blank">E-Mails abbestellen</a> | <a href="${appUrl}/#/profile" target="_blank">Profil verwalten</a> | <a href="${appUrl}/#/datenschutz" target="_blank">Datenschutz</a></p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

// Helper to send a single email via Resend API
async function sendEmailViaResend(to: string, subject: string, html: string, fromEmail: string) {
  const url = 'https://api.resend.com/emails';
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${resendApiKey}`
    },
    body: JSON.stringify({
      from: fromEmail,
      to,
      subject,
      html
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Resend API error (${response.status}): ${errorText}`);
  }

  return await response.json();
}

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const sendAll = args.includes('--send');
  
  let testEmail: string | null = null;
  const testEmailArg = args.find(arg => arg.startsWith('--test-email='));
  if (testEmailArg) {
    testEmail = testEmailArg.split('=')[1];
  }

  let limit: number | null = null;
  const limitArg = args.find(arg => arg.startsWith('--limit='));
  if (limitArg) {
    limit = parseInt(limitArg.split('=')[1], 10);
  }

  // Parse sender and URL from env or fallback
  const fromEmail = process.env.RESEND_FROM_EMAIL || '34a Master <support@34a-master.de>';
  const appUrl = process.env.CAMPAIGN_APP_URL || 'https://app.34a-master.de';
  const subject = 'Neu: Mündliche Prüfungssimulation mit KI-Prüfer Herr Müller';

  console.log('---------------------------------------------------------');
  console.log('📧 34a Master Email Campaign Manager');
  console.log(`- Supabase URL: ${supabaseUrl}`);
  console.log(`- From Email: ${fromEmail}`);
  console.log(`- App URL: ${appUrl}`);
  if (limit !== null) console.log(`- Limit: ${limit} users`);
  console.log('---------------------------------------------------------');

  if (!isDryRun && !testEmail && !sendAll) {
    console.log('Usage:');
    console.log('  npm run campaign:send-oral-exam -- --dry-run             (Preview count and email layout)');
    console.log('  npm run campaign:send-oral-exam -- --test-email=user@domain.com  (Send test to specified email)');
    console.log('  npm run campaign:send-oral-exam -- --send                (Send to ALL users in DB)');
    console.log('  npm run campaign:send-oral-exam -- --send --limit=80     (Send to a maximum of 80 users)');
    console.log('---------------------------------------------------------');
    process.exit(0);
  }

  // 1. Fetch users from Supabase Auth
  console.log('Fetching users from Supabase Auth...');
  const allUsers: any[] = [];
  let page = 1;
  const perPage = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage
    });

    if (error) {
      console.error('❌ Failed to list users:', error.message);
      process.exit(1);
    }

    if (data.users && data.users.length > 0) {
      allUsers.push(...data.users);
      console.log(`Fetched page ${page}: got ${data.users.length} users (total fetched: ${allUsers.length})`);
      if (data.users.length < perPage) {
        hasMore = false;
      } else {
        page++;
      }
    } else {
      hasMore = false;
    }
  }

  // Fetch profiles to check marketing subscription status and names
  console.log('Fetching user profiles for marketing status and campaign tracking...');
  const { data: profiles, error: profilesError } = await supabase
    .from('user_profiles')
    .select('id, display_name, unsubscribed_from_marketing, oral_exam_campaign_sent');

  if (profilesError) {
    console.warn('⚠️ Warning: Failed to fetch user profiles. Email personalization, unsubscribe, and campaign tracking checks might be incomplete. Error:', profilesError.message);
  }

  const profileMap = new Map<string, string>();
  const unsubscribedSet = new Set<string>();
  const campaignSentSet = new Set<string>();
  if (profiles) {
    profiles.forEach(p => {
      if (p.display_name && p.display_name.trim()) {
        profileMap.set(p.id, p.display_name.trim());
      }
      if (p.unsubscribed_from_marketing) {
        unsubscribedSet.add(p.id);
      }
      if (p.oral_exam_campaign_sent) {
        campaignSentSet.add(p.id);
      }
    });
  }

  // Filter users who have emails, have NOT unsubscribed, and have NOT received the campaign email yet
  const validUsers = allUsers.filter(u => u.email && !unsubscribedSet.has(u.id) && !campaignSentSet.has(u.id));
  console.log(`Campaign statistics:`);
  console.log(`  - Total users in database: ${allUsers.length}`);
  console.log(`  - Unsubscribed from marketing: ${unsubscribedSet.size}`);
  console.log(`  - Already received this campaign: ${campaignSentSet.size}`);
  console.log(`  - Remaining eligible users: ${validUsers.length}`);

  let targetUsers = validUsers;
  if (limit !== null) {
    targetUsers = validUsers.slice(0, limit);
    console.log(`⚠️ Limit parameter detected. Campaign will only target the first ${limit} users (out of ${validUsers.length}).`);
  }

  // 2. Execution logic
  if (isDryRun) {
    console.log('\n--- DRY RUN MODE ---');
    console.log(`Would send campaign to ${targetUsers.length} users (Limit: ${limit !== null ? limit : 'none'}).`);
    console.log('Sample users:');
    targetUsers.slice(0, 5).forEach((u, i) => {
      const name = profileMap.get(u.id) || 'N/A';
      console.log(`  ${i+1}. Email: ${u.email} | Name: ${name}`);
    });
    if (targetUsers.length > 5) {
      console.log(`  ... and ${targetUsers.length - 5} more users.`);
    }

    console.log('\nPreview of HTML Email Template:');
    const sampleHtml = generateEmailHtml('example@34a-master.de', 'Max Mustermann', appUrl);
    console.log('------------------ HTML START ------------------');
    console.log(sampleHtml);
    console.log('------------------- HTML END -------------------');
    console.log('\nDry run completed successfully. No emails were sent.');
  }

  else if (testEmail) {
    console.log(`\n--- SEND TEST EMAIL MODE ---`);
    console.log(`Sending campaign test email to: ${testEmail}`);
    const name = profileMap.get(validUsers.find(u => u.email.toLowerCase() === testEmail!.toLowerCase())?.id || '') || 'Test User';
    const html = generateEmailHtml(testEmail, name, appUrl);
    
    try {
      const result = await sendEmailViaResend(testEmail, subject, html, fromEmail);
      console.log('✅ Test email sent successfully! Result:', JSON.stringify(result));
    } catch (err: any) {
      console.error('❌ Failed to send test email:', err.message);
    }
  }

  else if (sendAll) {
    console.log(`\n⚠️ --- BROADCAST MODE: SENDING TO ${targetUsers.length} USERS (Limit: ${limit !== null ? limit : 'none'}) --- ⚠️`);
    console.log('Are you sure you want to do this? (Starting in 5 seconds...)');
    await new Promise(resolve => setTimeout(resolve, 5000));

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < targetUsers.length; i++) {
      const user = targetUsers[i];
      const name = profileMap.get(user.id) || undefined;
      const html = generateEmailHtml(user.email, name, appUrl);
      const progress = `[${i + 1}/${targetUsers.length}]`;

      try {
        console.log(`${progress} Sending email to: ${user.email} ...`);
        await sendEmailViaResend(user.email, subject, html, fromEmail);
        successCount++;
        
        // Mark user as campaign sent in database
        const { error: updateError } = await supabase
          .from('user_profiles')
          .update({ oral_exam_campaign_sent: true })
          .eq('id', user.id);
          
        if (updateError) {
          console.error(`⚠️ Failed to mark user ${user.email} as campaign sent in database:`, updateError.message);
        } else {
          console.log(`Marked user ${user.email} as sent in database.`);
        }
        
        // Add artificial delay to avoid hitting Resend free limit (e.g. 10 reqs/sec = 100ms interval)
        // Free tier has 10/s. 150ms is very safe.
        await new Promise(resolve => setTimeout(resolve, 150)); 
      } catch (err: any) {
        console.error(`❌ ${progress} Failed to send to ${user.email}:`, err.message);
        failCount++;
      }
    }

    console.log('---------------------------------------------------------');
    console.log('Campaign broadcast finished.');
    console.log(`Successfully sent: ${successCount}`);
    console.log(`Failed: ${failCount}`);
    console.log('---------------------------------------------------------');
  }
}

main().catch(err => {
  console.error('❌ Unhandled error:', err);
  process.exit(1);
});

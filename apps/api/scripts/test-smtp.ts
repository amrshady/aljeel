/**
 * Verify SMTP credentials and send a test message.
 *
 * Usage (from apps/api):
 *   npx tsx scripts/test-smtp.ts
 *   npx tsx scripts/test-smtp.ts --to you@example.com
 *
 * Reads SMTP_* and optional INVOICE_SUBMIT_NOTIFY_EMAILS from apps/api/.env
 * via process env (export or dotenv-loaded shell).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import nodemailer from 'nodemailer';

function loadEnvFile(): void {
  const envPath = resolve(__dirname, '../.env');
  try {
    const content = readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env optional if vars already exported
  }
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}. Set it in apps/api/.env or export it.`);
  }
  return value;
}

async function main() {
  loadEnvFile();

  const host = required('SMTP_HOST');
  const port = Number(process.env.SMTP_PORT ?? 587);
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASSWORD;
  const from = required('SMTP_FROM');

  const toArg = process.argv.find((arg) => arg.startsWith('--to='))?.slice(5);
  const to =
    toArg ??
    process.env.SMTP_TEST_TO?.trim() ??
    process.env.INVOICE_SUBMIT_NOTIFY_EMAILS?.split(',')[0]?.trim();

  if (!to) {
    throw new Error('No recipient. Pass --to=you@example.com or set INVOICE_SUBMIT_NOTIFY_EMAILS.');
  }

  console.log('SMTP configuration:');
  console.log(`  host:   ${host}`);
  console.log(`  port:   ${port}`);
  console.log(`  secure: ${secure}`);
  console.log(`  user:   ${user ?? '(none)'}`);
  console.log(`  from:   ${from}`);
  console.log(`  to:     ${to}`);
  console.log('');

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user ? { user, pass } : undefined,
  });

  console.log('1) Verifying SMTP connection and credentials...');
  await transporter.verify();
  console.log('   OK — server accepted the connection/login.\n');

  console.log('2) Sending test email...');
  const info = await transporter.sendMail({
    from,
    to,
    subject: 'Aljeel AP Portal — SMTP test',
    text: [
      'This is a test email from the Aljeel AP Portal API.',
      '',
      'If you received this, SMTP_HOST, SMTP_FROM, and (if set) SMTP_USER/SMTP_PASSWORD are working.',
      '',
      `Sent at: ${new Date().toISOString()}`,
    ].join('\n'),
    html: `<p>This is a test email from the <strong>Aljeel AP Portal</strong> API.</p>
<p>If you received this, <code>SMTP_HOST</code>, <code>SMTP_FROM</code>, and (if set) <code>SMTP_USER</code>/<code>SMTP_PASSWORD</code> are working.</p>
<p><small>Sent at: ${new Date().toISOString()}</small></p>`,
  });

  console.log(`   OK — message accepted by server (messageId: ${info.messageId ?? 'n/a'})\n`);
  console.log('Check the recipient inbox (and spam folder).');
  if (host === 'localhost' && port === 1025) {
    console.log('Mailpit is in use — open http://localhost:8025 instead of a real inbox.');
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('\nSMTP test failed:', message);
  console.error('\nCommon causes:');
  console.error('  - Wrong SMTP_HOST / SMTP_PORT');
  console.error('  - SMTP_USER or SMTP_PASSWORD incorrect');
  console.error('  - SMTP_FROM not allowed for that mailbox (use an address you can send as)');
  console.error('  - Provider requires app password or OAuth instead of normal password');
  process.exit(1);
});

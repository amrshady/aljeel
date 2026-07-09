Implemented the AP vendor email path rewrite to use `gog` via `execFile`, with no caller changes.

Files touched:
- [apps/api/src/notifications/email.service.ts](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/api/src/notifications/email.service.ts)

Build/test results:
- `env -u NODE_ENV pnpm --dir /home/clawdbot/.openclaw/workspace/aljeel-repo --filter @aljeel/api build` passed
- `env -u NODE_ENV pnpm --dir /home/clawdbot/.openclaw/workspace/aljeel-repo --filter @aljeel/api test -- invoice-submit-notification` passed: 1 file, 5 tests
- No services restarted, no deploy, no `.env` changes

Full new `email.service.ts`:

```ts
import { execFile } from 'node:child_process';
import { Injectable, Logger } from '@nestjs/common';

export interface SendEmailInput {
  to: string[];
  subject: string;
  text: string;
  html: string;
}

const DEFAULT_GOG_ACCOUNT = 'aljeel@accordpartners.ai';
const GOG_TIMEOUT_MS = 30_000;

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  isConfigured(): boolean {
    return process.env.NOTIFY_EMAIL_DISABLED !== 'true' && Boolean(this.getAccount());
  }

  async sendMail(input: SendEmailInput): Promise<void> {
    const recipients = [...new Set(input.to.map((email) => email.trim().toLowerCase()).filter(Boolean))];
    if (recipients.length === 0) {
      return;
    }

    if (!this.isConfigured()) {
      this.logger.warn(
        { recipients, subject: input.subject },
        'Email notification is disabled; skipping email notification',
      );
      return;
    }

    const failures: string[] = [];
    for (const recipient of recipients) {
      try {
        await this.sendWithGog(recipient, input.subject, input.html);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(`${recipient}: ${message}`);
      }
    }

    if (failures.length > 0) {
      throw new Error(`Failed to send email notification via gog: ${failures.join('; ')}`);
    }
  }

  private sendWithGog(recipient: string, subject: string, html: string): Promise<void> {
    const account = this.getAccount();
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      GOG_KEYRING_BACKEND: 'file',
      GOG_KEYRING_PASSWORD: process.env.GOG_KEYRING_PASSWORD ?? 'openclaw',
      GOG_ACCOUNT: account,
      HOME: process.env.HOME ?? '/home/clawdbot',
      PATH: process.env.PATH ?? '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
    };

    return new Promise((resolve, reject) => {
      execFile(
        'gog',
        ['gmail', 'send', '--account', account, '--to', recipient, '--subject', subject, '--body-html', html],
        { env, timeout: GOG_TIMEOUT_MS },
        (error, _stdout, stderr) => {
          if (error) {
            const detail = stderr.trim() || error.message;
            reject(new Error(detail));
            return;
          }
          resolve();
        },
      );
    });
  }

  private getAccount(): string {
    return process.env.GOG_ACCOUNT?.trim() || DEFAULT_GOG_ACCOUNT;
  }
}
```

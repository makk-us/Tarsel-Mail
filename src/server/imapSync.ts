import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import type { EmailThread, ImapAccountConfig } from '../types/mail.ts';
import { getAccountWithSecrets, saveAccount, upsertThread } from './db.ts';

export async function testImapConnection(config: {
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  imapUser: string;
  imapPass: string;
}): Promise<{ ok: boolean; mailboxes?: string[]; error?: string }> {
  const client = new ImapFlow({
    host: config.imapHost,
    port: config.imapPort,
    secure: config.imapSecure,
    auth: {
      user: config.imapUser,
      pass: config.imapPass,
    },
    logger: false,
    connectionTimeout: 8000,
  });

  try {
    await client.connect();
    const list = await client.list();
    await client.logout();
    return {
      ok: true,
      mailboxes: list.map((m) => m.path),
    };
  } catch (err) {
    try {
      client.close();
    } catch {
      // ignore close error
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'IMAP connection failed',
    };
  }
}

export async function syncImapAccount(
  accountId: string,
  limit = 25
): Promise<{ syncedCount: number; mode: 'demo' | 'imap'; error?: string }> {
  const account = getAccountWithSecrets(accountId);
  if (!account) {
    return { syncedCount: 0, mode: 'demo', error: 'Account not found' };
  }

  if (account.mode === 'demo' || !account.imapPass) {
    const now = new Date().toISOString();
    saveAccount({ ...account, lastSyncAt: now });
    return { syncedCount: 0, mode: 'demo' };
  }

  const client = new ImapFlow({
    host: account.imapHost,
    port: account.imapPort,
    secure: account.imapSecure,
    auth: {
      user: account.imapUser,
      pass: account.imapPass,
    },
    logger: false,
    connectionTimeout: 12000,
  });

  let syncedCount = 0;

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      const total = client.mailbox ? client.mailbox.exists : 0;
      if (total > 0) {
        const startSeq = Math.max(1, total - limit + 1);
        for await (const msg of client.fetch(`${startSeq}:*`, {
          uid: true,
          flags: true,
          source: true,
          envelope: true,
        })) {
          if (!msg.source) continue;
          const parsed = await simpleParser(msg.source);
          const fromAddr = parsed.from?.value?.[0];
          const fromName = fromAddr?.name || fromAddr?.address || 'Unknown';
          const fromEmail = fromAddr?.address || 'unknown@imap.local';
          const subject = parsed.subject || '(No Subject)';
          const bodyText =
            parsed.text ||
            (parsed.html
              ? parsed.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
              : '');
          const dateIso = (parsed.date || new Date()).toISOString();
          const threadId = `imap-${account.id}-${msg.uid}`;

          const attachments = (parsed.attachments || []).map((att, idx) => ({
            id: `att-${msg.uid}-${idx}`,
            filename: att.filename || `attachment-${idx + 1}`,
            mimeType: att.contentType || 'application/octet-stream',
            sizeBytes: att.size || 0,
          }));

          const isSeen = msg.flags?.has('\\Seen') ?? false;
          const isFlagged = msg.flags?.has('\\Flagged') ?? false;

          const thread: EmailThread = {
            id: threadId,
            accountId: account.id,
            subject,
            snippet: bodyText.slice(0, 140),
            participants: [{ name: fromName, email: fromEmail }],
            lastMessageAt: dateIso,
            isUnread: !isSeen,
            isStarred: isFlagged,
            isImportant: isFlagged,
            status: 'inbox',
            bundle: 'Updates',
            labels: [],
            messages: [
              {
                id: `msg-${msg.uid}`,
                threadId,
                fromName,
                fromEmail,
                to: [account.email],
                date: dateIso,
                bodyText,
                bodyHtml: typeof parsed.html === 'string' ? parsed.html : undefined,
                attachments,
                isFromMe: fromEmail.toLowerCase() === account.email.toLowerCase(),
              },
            ],
          };

          upsertThread(thread);
          syncedCount += 1;
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();
    saveAccount({ ...account, lastSyncAt: new Date().toISOString() });
    return { syncedCount, mode: 'imap' };
  } catch (err) {
    try {
      client.close();
    } catch {
      // ignore
    }
    return {
      syncedCount,
      mode: 'imap',
      error: err instanceof Error ? err.message : 'IMAP sync error',
    };
  }
}

export async function sendSmtpEmail(
  account: ImapAccountConfig,
  payload: {
    to: string[];
    cc?: string[];
    subject: string;
    bodyText: string;
  }
): Promise<{ ok: boolean; messageId?: string; deliveredVia: 'smtp' | 'local'; error?: string }> {
  if (account.mode === 'demo' || !account.smtpPass || !account.smtpHost) {
    return {
      ok: true,
      messageId: `local-${Date.now()}`,
      deliveredVia: 'local',
    };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: account.smtpHost,
      port: account.smtpPort,
      secure: account.smtpSecure,
      auth: {
        user: account.smtpUser,
        pass: account.smtpPass,
      },
    });

    const info = await transporter.sendMail({
      from: `"${account.displayName}" <${account.email}>`,
      to: payload.to.join(', '),
      cc: payload.cc?.length ? payload.cc.join(', ') : undefined,
      subject: payload.subject,
      text: payload.bodyText,
    });

    return {
      ok: true,
      messageId: info.messageId,
      deliveredVia: 'smtp',
    };
  } catch (err) {
    return {
      ok: false,
      deliveredVia: 'smtp',
      error: err instanceof Error ? err.message : 'SMTP delivery failed',
    };
  }
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSearchQuery,
  buildFtsMatchQuery,
  filterThreadsByParsedQuery,
} from './mailSearch.ts';
import type { EmailThread } from '../types/mail.ts';

const sampleThreads: EmailThread[] = [
  {
    id: 't1',
    accountId: 'acc-1',
    subject: 'AWS Invoice #8492 - October Usage',
    snippet: 'Total due: $1,240.00 for production cluster',
    participants: [{ name: 'AWS Billing', email: 'billing@amazonaws.com' }],
    lastMessageAt: '2026-11-12T10:00:00Z',
    isUnread: true,
    isStarred: true,
    isImportant: false,
    status: 'inbox',
    bundle: 'Finance & Receipts',
    labels: ['Invoice', 'Cloud'],
    messages: [
      {
        id: 'm1',
        threadId: 't1',
        fromName: 'AWS Billing',
        fromEmail: 'billing@amazonaws.com',
        to: ['founder@tarsel.local'],
        date: '2026-11-12T10:00:00Z',
        bodyText: 'Your October AWS invoice is $1,240.00. PDF attached.',
        attachments: [
          {
            id: 'att1',
            filename: 'aws-invoice-oct.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 184200,
          },
        ],
      },
    ],
  },
  {
    id: 't2',
    accountId: 'acc-1',
    subject: 'Q4 Product Roadmap Sync',
    snippet: 'Can we meet Thursday at 2pm to finalize specs?',
    participants: [{ name: 'Elena Rostova', email: 'elena@linear.dev' }],
    lastMessageAt: '2026-11-12T09:15:00Z',
    isUnread: false,
    isStarred: false,
    isImportant: true,
    status: 'inbox',
    bundle: 'Priority',
    labels: ['Engineering'],
    messages: [
      {
        id: 'm2',
        threadId: 't2',
        fromName: 'Elena Rostova',
        fromEmail: 'elena@linear.dev',
        to: ['founder@tarsel.local'],
        date: '2026-11-12T09:15:00Z',
        bodyText: 'Hey! Let us review the search index latency targets on Thursday.',
        attachments: [],
      },
    ],
  },
];

test('parseSearchQuery extracts operators and free text terms', () => {
  const parsed = parseSearchQuery(
    'from:aws has:attachment is:starred bundle:Finance "October Usage"'
  );
  assert.equal(parsed.from, 'aws');
  assert.equal(parsed.hasAttachment, true);
  assert.equal(parsed.isStarred, true);
  assert.equal(parsed.bundle, 'finance');
  assert.deepEqual(parsed.textTerms, ['october usage']);
});

test('buildFtsMatchQuery sanitizes terms into prefix FTS5 expressions', () => {
  const fts = buildFtsMatchQuery(['invoice', 'oct*']);
  assert.equal(fts, '"invoice"* AND "oct"*');
  assert.equal(buildFtsMatchQuery([]), '');
});

test('filterThreadsByParsedQuery accurately filters by operators and attachment names', () => {
  const byAttachment = filterThreadsByParsedQuery(
    sampleThreads,
    parseSearchQuery('has:attachment aws-invoice-oct')
  );
  assert.equal(byAttachment.length, 1);
  assert.equal(byAttachment[0].id, 't1');

  const byImportant = filterThreadsByParsedQuery(
    sampleThreads,
    parseSearchQuery('is:important latency')
  );
  assert.equal(byImportant.length, 1);
  assert.equal(byImportant[0].id, 't2');

  const taggedThreads: EmailThread[] = [
    { ...sampleThreads[0], isReadLater: true },
    { ...sampleThreads[1], isReadLater: false },
  ];
  const byReadLater = filterThreadsByParsedQuery(
    taggedThreads,
    parseSearchQuery('is:readlater')
  );
  assert.equal(byReadLater.length, 1);
  assert.equal(byReadLater[0].id, 't1');
});

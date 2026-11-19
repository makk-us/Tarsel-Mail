import test from 'node:test';
import assert from 'node:assert/strict';
import {
  groupThreadsIntoBundles,
  evaluateFilterHeuristically,
} from './aiRuleEngine.ts';
import type { AIFilterRule, EmailThread } from '../types/mail.ts';

const threads: EmailThread[] = [
  {
    id: 't1',
    accountId: 'acc-1',
    subject: 'Stripe Receipt for $890.00',
    snippet: 'Payment confirmation for annual workspace plan',
    participants: [{ name: 'Stripe', email: 'receipts@stripe.com' }],
    lastMessageAt: '2026-11-12T12:00:00Z',
    isUnread: true,
    isStarred: false,
    isImportant: false,
    status: 'inbox',
    bundle: 'Finance & Receipts',
    labels: [],
    messages: [
      {
        id: 'm1',
        threadId: 't1',
        fromName: 'Stripe',
        fromEmail: 'receipts@stripe.com',
        to: ['me@tarsel.local'],
        date: '2026-11-12T12:00:00Z',
        bodyText: 'Your invoice receipt totaling $890.00 has been paid.',
        attachments: [],
      },
    ],
  },
  {
    id: 't2',
    accountId: 'acc-1',
    subject: 'Urgent: Contract review needed today',
    snippet: 'Please review the MSA before 5pm',
    participants: [{ name: 'Marcus Chen', email: 'marcus@acme.io' }],
    lastMessageAt: '2026-11-12T13:00:00Z',
    isUnread: true,
    isStarred: false,
    isImportant: true,
    status: 'inbox',
    bundle: 'Priority',
    labels: [],
    messages: [
      {
        id: 'm2',
        threadId: 't2',
        fromName: 'Marcus Chen',
        fromEmail: 'marcus@acme.io',
        to: ['me@tarsel.local'],
        date: '2026-11-12T13:00:00Z',
        bodyText: 'Please review the MSA and sign before 5pm.',
        attachments: [],
      },
    ],
  },
];

test('groupThreadsIntoBundles places Priority first and aggregates unread counts', () => {
  const groups = groupThreadsIntoBundles(threads);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].bundleName, 'Priority');
  assert.equal(groups[0].unreadCount, 1);
  assert.equal(groups[1].bundleName, 'Finance & Receipts');
});

test('evaluateFilterHeuristically parses plain-English rules with thresholds and actions', () => {
  const rule: AIFilterRule = {
    id: 'r1',
    name: 'High-Value Receipts',
    prompt:
      'Label receipts and invoices as Finance, star anything over $500, and bundle into Receipts',
    enabled: true,
    autoApplyOnSync: true,
    targetBundle: 'Finance & Receipts',
    matchCount: 0,
    createdAt: '2026-11-12T08:00:00Z',
  };

  const results = evaluateFilterHeuristically(rule, threads);
  assert.equal(results.length, 1);
  assert.equal(results[0].threadId, 't1');
  assert.equal(results[0].actionsApplied.star, true);
  assert.equal(results[0].actionsApplied.bundle, 'Finance & Receipts');
  assert.deepEqual(results[0].actionsApplied.addLabels, ['Finance']);
});

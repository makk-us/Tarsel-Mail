import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inferDefaultBundleSuggestion,
  normalizeFolderNameToLabel,
  parseGmailLabelsHeader,
  resolveThreadBundleAndStatus,
  splitMboxMessages,
} from './mboxParser.ts';

test('splitMboxMessages separates multiple messages and unescapes >From lines', () => {
  const sample = [
    'From 12345@xxx Mon Jan 01 00:00:00 +0000 2026',
    'Subject: First message',
    'From: Alice <alice@example.com>',
    '',
    'Hello!',
    '>From time to time this happens.',
    '',
    'From 67890@xxx Tue Jan 02 10:00:00 +0000 2026',
    'Subject: Second message',
    'From: Bob <bob@example.com>',
    '',
    'Second body line.',
  ].join('\r\n');

  const msgs = splitMboxMessages(sample);
  assert.equal(msgs.length, 2);
  assert.match(msgs[0], /Subject: First message/);
  assert.match(msgs[0], /^From time to time this happens\.$/m);
  assert.match(msgs[1], /Subject: Second message/);
});

test('parseGmailLabelsHeader extracts system flags and user/category labels', () => {
  const parsed = parseGmailLabelsHeader(
    'Inbox,Unread,Starred,Important,"Finance, 2026",Work/Contracts,Category Updates'
  );

  assert.equal(parsed.systemFlags.inInbox, true);
  assert.equal(parsed.systemFlags.isUnread, true);
  assert.equal(parsed.systemFlags.isStarred, true);
  assert.equal(parsed.systemFlags.isImportant, true);
  assert.equal(parsed.systemFlags.isSent, false);
  assert.deepEqual(parsed.userLabels, [
    'Finance, 2026',
    'Work/Contracts',
    'Updates',
  ]);
});

test('normalizeFolderNameToLabel extracts folder label and ignores generic Takeout filenames', () => {
  assert.equal(
    normalizeFolderNameToLabel('All mail Including Spam and Trash.mbox'),
    null
  );
  assert.equal(normalizeFolderNameToLabel('Inbox.mbox'), null);
  assert.equal(normalizeFolderNameToLabel('Takeout/Mail/Receipts.mbox'), 'Receipts');
  assert.equal(normalizeFolderNameToLabel('Tax_2025 (1).mbox'), 'Tax 2025');
});

test('inferDefaultBundleSuggestion merges known categories and creates new bundles for custom labels', () => {
  const existing = [
    'Priority',
    'Finance & Receipts',
    'DevOps',
    'Travel',
    'Updates',
    'Newsletters',
  ];

  assert.deepEqual(inferDefaultBundleSuggestion('Receipts', existing), {
    action: 'merge',
    targetBundle: 'Finance & Receipts',
  });
  assert.deepEqual(inferDefaultBundleSuggestion('Travel', existing), {
    action: 'merge',
    targetBundle: 'Travel',
  });
  assert.deepEqual(inferDefaultBundleSuggestion('Work/Clients', existing), {
    action: 'create',
    targetBundle: 'Work · Clients',
  });
});

test('resolveThreadBundleAndStatus applies merge/create rules and preserves labels and status', () => {
  const resolved = resolveThreadBundleAndStatus({
    allCandidateLabels: ['Updates', 'Client/Acme'],
    systemFlags: {
      inInbox: true,
      isUnread: true,
      isStarred: false,
      isImportant: false,
      isSent: false,
      isArchived: false,
      isSpamOrTrash: false,
    },
    mappings: [
      { label: 'Updates', action: 'merge', targetBundle: 'Updates' },
      { label: 'Client/Acme', action: 'create', targetBundle: 'Acme Corp' },
    ],
    preserveStatus: true,
    defaultBundle: 'Updates',
  });

  assert.equal(resolved.bundle, 'Acme Corp');
  assert.equal(resolved.createdBundleUsed, 'Acme Corp');
  assert.equal(resolved.status, 'inbox');
  assert.deepEqual(resolved.labels, ['Updates', 'Client/Acme']);
});

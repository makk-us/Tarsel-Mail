import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_PANE_SIZES,
  PANE_BOUNDS,
  clampPaneSize,
  computeReplyFormBounds,
  computeResizedPaneSize,
  sanitizePaneSizes,
} from './paneLayout.ts';

test('clampPaneSize enforces min/max bounds and handles non-finite input', () => {
  assert.equal(clampPaneSize(120, 180, 380), 180);
  assert.equal(clampPaneSize(450, 180, 380), 380);
  assert.equal(clampPaneSize(264.6, 180, 380), 265);
  assert.equal(clampPaneSize(Number.NaN, 180, 380), 180);
  assert.equal(clampPaneSize(200, 300, 220), 300);
});

test('computeReplyFormBounds adapts max height to thread detail container height', () => {
  const tallBounds = computeReplyFormBounds(848);
  assert.equal(tallBounds.min, PANE_BOUNDS.replyForm.min);
  assert.equal(tallBounds.max, 560);

  const mediumBounds = computeReplyFormBounds(620);
  assert.equal(mediumBounds.max, 380);

  const tightBounds = computeReplyFormBounds(300);
  assert.equal(tightBounds.max, PANE_BOUNDS.replyForm.min);

  const fallbackBounds = computeReplyFormBounds(undefined);
  assert.equal(fallbackBounds.max, PANE_BOUNDS.replyForm.maxAbsolute);
});

test('computeResizedPaneSize supports normal and inverted drag deltas', () => {
  // Dragging sidebar right border +48px makes sidebar wider
  assert.equal(computeResizedPaneSize(232, 48, 180, 380, false), 280);
  // Dragging reply form top border upward (-120px) makes reply form taller
  assert.equal(computeResizedPaneSize(140, -120, 116, 560, true), 260);
  // Dragging reply form top border downward (+80px) shrinks it down to min
  assert.equal(computeResizedPaneSize(140, 80, 116, 560, true), 116);
});

test('sanitizePaneSizes falls back to defaults and clamps out-of-range values', () => {
  const defaults = sanitizePaneSizes(undefined);
  assert.deepEqual(defaults, DEFAULT_PANE_SIZES);

  const clamped = sanitizePaneSizes(
    {
      sidebarWidth: 50,
      threadListWidth: 999,
      replyFormHeight: 700,
    },
    600
  );
  assert.deepEqual(clamped, {
    sidebarWidth: 180,
    threadListWidth: 680,
    replyFormHeight: 360,
  });
});

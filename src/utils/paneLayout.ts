export interface PaneSizes {
  sidebarWidth: number;
  threadListWidth: number;
  replyFormHeight: number;
}

export const DEFAULT_PANE_SIZES: PaneSizes = {
  sidebarWidth: 232,
  threadListWidth: 420,
  replyFormHeight: 140,
};

export const PANE_BOUNDS = {
  sidebar: { min: 180, max: 380 },
  threadList: { min: 280, max: 680 },
  replyForm: {
    min: 116,
    maxAbsolute: 560,
    minRemainingSpace: 240,
  },
} as const;

export const PANE_STORAGE_KEY = 'tarsel_pane_sizes';
const LEGACY_PANE_STORAGE_KEY = 'kestrel_pane_sizes';

export function clampPaneSize(value: number, min: number, max: number): number {
  const safeMax = Math.max(min, max);
  if (!Number.isFinite(value)) return min;
  return Math.min(safeMax, Math.max(min, Math.round(value)));
}

export function computeReplyFormBounds(containerHeight?: number): {
  min: number;
  max: number;
} {
  const { min, maxAbsolute, minRemainingSpace } = PANE_BOUNDS.replyForm;
  if (typeof containerHeight === 'number' && Number.isFinite(containerHeight) && containerHeight > 0) {
    const dynamicMax = Math.min(maxAbsolute, containerHeight - minRemainingSpace);
    return {
      min,
      max: Math.max(min, Math.round(dynamicMax)),
    };
  }
  return { min, max: maxAbsolute };
}

export function computeResizedPaneSize(
  startSize: number,
  pointerDeltaPx: number,
  min: number,
  max: number,
  invertDelta = false
): number {
  const effectiveDelta = invertDelta ? -pointerDeltaPx : pointerDeltaPx;
  return clampPaneSize(startSize + effectiveDelta, min, max);
}

export function sanitizePaneSizes(
  raw: Partial<PaneSizes> | null | undefined,
  replyContainerHeight?: number
): PaneSizes {
  const replyBounds = computeReplyFormBounds(replyContainerHeight);
  return {
    sidebarWidth: clampPaneSize(
      typeof raw?.sidebarWidth === 'number'
        ? raw.sidebarWidth
        : DEFAULT_PANE_SIZES.sidebarWidth,
      PANE_BOUNDS.sidebar.min,
      PANE_BOUNDS.sidebar.max
    ),
    threadListWidth: clampPaneSize(
      typeof raw?.threadListWidth === 'number'
        ? raw.threadListWidth
        : DEFAULT_PANE_SIZES.threadListWidth,
      PANE_BOUNDS.threadList.min,
      PANE_BOUNDS.threadList.max
    ),
    replyFormHeight: clampPaneSize(
      typeof raw?.replyFormHeight === 'number'
        ? raw.replyFormHeight
        : DEFAULT_PANE_SIZES.replyFormHeight,
      replyBounds.min,
      replyBounds.max
    ),
  };
}

export function loadPaneSizes(): PaneSizes {
  try {
    const raw =
      localStorage.getItem(PANE_STORAGE_KEY) ||
      localStorage.getItem(LEGACY_PANE_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PANE_SIZES };
    const parsed = JSON.parse(raw) as Partial<PaneSizes>;
    return sanitizePaneSizes(parsed);
  } catch {
    return { ...DEFAULT_PANE_SIZES };
  }
}

export function savePaneSizes(sizes: PaneSizes): void {
  try {
    localStorage.setItem(PANE_STORAGE_KEY, JSON.stringify(sanitizePaneSizes(sizes)));
  } catch {
    // ignore storage quota / private mode errors
  }
}

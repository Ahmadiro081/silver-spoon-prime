/**
 * Accessibility utilities for keyboard navigation and dialog focus management.
 * Pure helpers so modal/drawer focus trapping can be unit-tested without browser mocks.
 */

export const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

/**
 * Computes the next focus target index when cycling focus inside a trapped container.
 * Returns null if the event does not require focus wrapping.
 */
export function computeFocusTrapTargetIndex({
  count,
  activeIndex,
  shiftKey,
}: {
  count: number;
  activeIndex: number;
  shiftKey: boolean;
}): number | null {
  if (count <= 0) return null;

  if (shiftKey) {
    if (activeIndex <= 0) {
      return count - 1;
    }
    return null;
  }

  if (activeIndex === -1 || activeIndex >= count - 1) {
    return 0;
  }

  return null;
}

/**
 * Returns visible, keyboard-focusable elements inside a container in DOM order.
 */
export function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  const nodes = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  return nodes.filter((el) => {
    if (el.hasAttribute("disabled") || el.getAttribute("aria-hidden") === "true") {
      return false;
    }
    if (typeof window !== "undefined") {
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") {
        return false;
      }
    }
    return true;
  });
}

/**
 * Handles Tab / Shift+Tab keyboard events inside a modal dialog or mobile drawer
 * to keep keyboard focus trapped within the container.
 */
export function handleFocusTrapKeyDown(
  event: KeyboardEvent,
  container: HTMLElement | null,
): void {
  if (event.key !== "Tab" || !container) return;

  const focusable = getFocusableElements(container);
  if (focusable.length === 0) {
    event.preventDefault();
    container.focus();
    return;
  }

  const activeEl = document.activeElement as HTMLElement | null;
  const activeIndex = activeEl ? focusable.indexOf(activeEl) : -1;
  const nextIndex = computeFocusTrapTargetIndex({
    count: focusable.length,
    activeIndex,
    shiftKey: event.shiftKey,
  });

  if (nextIndex !== null) {
    event.preventDefault();
    focusable[nextIndex]?.focus();
  }
}

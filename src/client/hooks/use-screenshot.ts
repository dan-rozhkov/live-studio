import { useCallback } from 'preact/hooks';
import { useStore } from '../state/store';
import { getElementById } from '../bridge/dom-bridge';
import {
  captureElementToBlob,
  captureRegionToBlob,
  copyBlobToClipboard,
  ensureDisplayStream,
  type Rect,
} from '../utils/screenshot';

const MARQUEE_Z = 2147483645;

function emitCopied() {
  window.dispatchEvent(new CustomEvent('livestudio:screenshot-copied'));
}

interface VideoWithFrameCallback extends HTMLVideoElement {
  requestVideoFrameCallback?: (cb: () => void) => number;
}

/**
 * Wait for `n` fresh frames from the getDisplayMedia stream. The stream lags
 * DOM updates by a compositor cycle, so `requestAnimationFrame` isn't enough
 * — we need the video element to actually receive new frames.
 */
function waitVideoFrames(video: HTMLVideoElement, n: number): Promise<void> {
  const v = video as VideoWithFrameCallback;
  if (typeof v.requestVideoFrameCallback !== 'function') {
    return new Promise((resolve) => setTimeout(resolve, 150));
  }
  return new Promise((resolve) => {
    const tick = (left: number) => {
      if (left <= 0) resolve();
      else v.requestVideoFrameCallback!(() => tick(left - 1));
    };
    tick(n);
  });
}

function rectBetween(ax: number, ay: number, bx: number, by: number): Rect {
  return {
    x: Math.min(ax, bx),
    y: Math.min(ay, by),
    width: Math.abs(bx - ax),
    height: Math.abs(by - ay),
  };
}

function runMarquee(): Promise<Rect | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText =
      `position:fixed;inset:0;z-index:${MARQUEE_Z};cursor:crosshair;` +
      `background:rgba(13,153,255,0.05);user-select:none;`;

    const box = document.createElement('div');
    box.style.cssText =
      `position:fixed;z-index:${MARQUEE_Z + 1};border:1.5px solid #0D99FF;` +
      `background:rgba(13,153,255,0.12);pointer-events:none;display:none;` +
      `box-sizing:border-box;`;

    document.documentElement.appendChild(overlay);
    document.documentElement.appendChild(box);

    let startX = 0;
    let startY = 0;
    let dragging = false;

    function finish(rect: Rect | null) {
      overlay.remove();
      box.remove();
      window.removeEventListener('mousemove', onMove, true);
      window.removeEventListener('mouseup', onUp, true);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('keydown', onKey, true);
      resolve(rect);
    }

    function onDown(e: MouseEvent) {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      box.style.display = 'block';
      box.style.left = startX + 'px';
      box.style.top = startY + 'px';
      box.style.width = '0px';
      box.style.height = '0px';
    }

    function onMove(e: MouseEvent) {
      if (!dragging) return;
      const r = rectBetween(startX, startY, e.clientX, e.clientY);
      box.style.left = r.x + 'px';
      box.style.top = r.y + 'px';
      box.style.width = r.width + 'px';
      box.style.height = r.height + 'px';
    }

    function onUp(e: MouseEvent) {
      if (!dragging) return;
      dragging = false;
      const r = rectBetween(startX, startY, e.clientX, e.clientY);
      finish(r.width < 4 || r.height < 4 ? null : r);
    }

    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      finish(null);
    }

    function onBlur() {
      finish(null);
    }

    // mousemove/mouseup on window so a drag that ends outside the viewport
    // (or pointer capture quirk) still terminates the marquee.
    overlay.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove, true);
    window.addEventListener('mouseup', onUp, true);
    window.addEventListener('blur', onBlur);
    document.addEventListener('keydown', onKey, true);
  });
}

let inFlight = false;

export function useScreenshot() {
  return useCallback(async () => {
    if (inFlight) return;
    inFlight = true;
    const { selectedNodeId } = useStore.getState();

    try {
      if (selectedNodeId !== null) {
        const el = getElementById(selectedNodeId);
        if (!(el instanceof HTMLElement)) return;
        await copyBlobToClipboard(await captureElementToBlob(el));
        emitCopied();
        return;
      }

      // Prime the display stream first so the permission prompt can't
      // interrupt the drag; bail quietly if the user declines.
      const video = await ensureDisplayStream();

      const rect = await runMarquee();
      if (!rect) return;

      // Overlay/box are removed before this point; wait for a fresh video
      // frame (lags DOM by a compositor cycle) so the overlay isn't baked in.
      await waitVideoFrames(video, 2);

      await copyBlobToClipboard(await captureRegionToBlob(rect));
      emitCopied();
    } catch (err) {
      console.error('[live-studio] screenshot failed:', err);
    } finally {
      inFlight = false;
    }
  }, []);
}

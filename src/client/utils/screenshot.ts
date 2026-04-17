import { toBlob } from 'html-to-image';

const STUDIO_TAG = 'live-studio-panel';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function isInsideStudio(node: Node): boolean {
  let cur: Node | null = node;
  while (cur) {
    if (cur instanceof Element && cur.localName === STUDIO_TAG) return true;
    cur = cur.parentNode;
  }
  return false;
}

export async function captureElementToBlob(el: HTMLElement): Promise<Blob> {
  const blob = await toBlob(el, {
    pixelRatio: window.devicePixelRatio || 1,
    cacheBust: true,
    filter: (node) => !isInsideStudio(node),
  });
  if (!blob) throw new Error('html-to-image returned no blob');
  return blob;
}

// Non-standard but widely-supported display-media hints.
interface ExtendedDisplayMediaOptions extends DisplayMediaStreamOptions {
  preferCurrentTab?: boolean;
  selfBrowserSurface?: 'include' | 'exclude';
  surfaceSwitching?: 'include' | 'exclude';
}

let displayStream: MediaStream | null = null;
let displayVideo: HTMLVideoElement | null = null;
let pendingStream: Promise<HTMLVideoElement> | null = null;

/**
 * Reuse the tab-share stream across calls so the permission prompt fires once
 * per session. In-flight requests are deduped so rapid double-invocations
 * don't orphan a second stream. Call this up-front (before showing marquee UI)
 * so the prompt never interrupts a drag.
 */
export async function ensureDisplayStream(): Promise<HTMLVideoElement> {
  if (displayStream?.active && displayVideo) return displayVideo;
  if (pendingStream) return pendingStream;

  pendingStream = (async () => {
    const opts: ExtendedDisplayMediaOptions = {
      video: { cursor: 'never' } as MediaTrackConstraints,
      audio: false,
      preferCurrentTab: true,
      selfBrowserSurface: 'include',
      surfaceSwitching: 'exclude',
    };
    const stream = await navigator.mediaDevices.getDisplayMedia(opts);

    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    await video.play();

    stream.getVideoTracks()[0].addEventListener('ended', () => {
      displayStream = null;
      displayVideo = null;
      video.srcObject = null;
    });

    displayStream = stream;
    displayVideo = video;
    return video;
  })();

  try {
    return await pendingStream;
  } finally {
    pendingStream = null;
  }
}

export async function captureRegionToBlob(rect: Rect): Promise<Blob> {
  const video = await ensureDisplayStream();

  const scaleX = video.videoWidth / window.innerWidth;
  const scaleY = video.videoHeight / window.innerHeight;

  const sx = Math.max(0, Math.round(rect.x * scaleX));
  const sy = Math.max(0, Math.round(rect.y * scaleY));
  const sw = Math.min(video.videoWidth - sx, Math.round(rect.width * scaleX));
  const sh = Math.min(video.videoHeight - sy, Math.round(rect.height * scaleY));

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, sw);
  canvas.height = Math.max(1, sh);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not obtain 2d context');
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas.toBlob failed'))), 'image/png');
  });
}

export async function copyBlobToClipboard(blob: Blob): Promise<void> {
  await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
}

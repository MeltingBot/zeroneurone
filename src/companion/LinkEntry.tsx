/**
 * Opening a share link from inside the companion: paste it, or scan the QR
 * code with the page's own scanner. The browser's BarcodeDetector reads the
 * code where there is one (Chrome on Android); elsewhere (Safari on iPhone)
 * jsQR does, loaded only when the scanner opens.
 * Desktop links (/join/…) are accepted too: same parts as /m/ links.
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ClipboardPaste, QrCode, ScanLine, X } from 'lucide-react';
import { IconAction } from './IconAction';
import { companionPathOf, openLink } from './shareLink';
import { inputClass } from './ui';

type Detector = { detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> };
type DetectorCtor = new (options: { formats: string[] }) => Detector;

function barcodeDetector(): DetectorCtor | null {
  return (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector ?? null;
}

/** Reads the QR codes in the current video frame */
type QrReader = (video: HTMLVideoElement) => Promise<string[]>;

/** Frames are scaled down to this for jsQR: enough for a QR code, light on the phone */
const JSQR_MAX_SIDE = 640;

async function qrReader(): Promise<QrReader> {
  const Ctor = barcodeDetector();
  if (Ctor) {
    const detector = new Ctor({ formats: ['qr_code'] });
    return async (video) => (await detector.detect(video)).map((c) => c.rawValue);
  }
  const { default: jsQR } = await import('jsqr');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('No 2D canvas');
  return async (video) => {
    const scale = Math.min(1, JSQR_MAX_SIDE / Math.max(video.videoWidth, video.videoHeight));
    const width = Math.round(video.videoWidth * scale);
    const height = Math.round(video.videoHeight * scale);
    if (!width || !height) return [];
    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(video, 0, 0, width, height);
    const code = jsQR(ctx.getImageData(0, 0, width, height).data, width, height, { inversionAttempts: 'dontInvert' });
    return code ? [code.data] : [];
  };
}

/**
 * `empty`: no dossier on the phone yet. The QR code shown then is the
 * scanner's button (it is what people tap), with a line of help under it.
 */
export function LinkEntry({ empty = false }: { empty?: boolean }) {
  const { t } = useTranslation('companion');
  const [text, setText] = useState('');
  const [error, setError] = useState(false);
  const [scanning, setScanning] = useState(false);
  const canScan = !!navigator.mediaDevices?.getUserMedia;
  const canPaste = !!navigator.clipboard?.readText;
  // With no dossier yet, the large QR code is the scan button
  const smallScan = canScan && !empty;

  const submit = (value: string) => {
    if (!value.trim()) return;
    setError(!openLink(value));
  };

  const paste = async () => {
    try {
      const value = await navigator.clipboard.readText();
      setText(value);
      submit(value);
    } catch {
      // Permission refused: the field still takes a manual paste
    }
  };

  return (
    <div className="space-y-2">
      {empty && (
        <div className="flex flex-col items-center text-center gap-3 pt-4 pb-2 text-text-secondary">
          {canScan ? (
            <button
              type="button"
              onClick={() => setScanning(true)}
              className="w-32 h-32 flex items-center justify-center rounded sketchy-border border border-border-strong bg-bg-secondary text-text-primary active:bg-bg-tertiary"
              aria-label={t('home.scan')}
              title={t('home.scan')}
            >
              <QrCode size={64} strokeWidth={1.5} />
            </button>
          ) : (
            <QrCode size={32} className="text-text-tertiary" />
          )}
          <p className="text-sm">{t('home.empty')}</p>
        </div>
      )}
      <input
        type="url"
        inputMode="url"
        enterKeyHint="go"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        className={inputClass}
        value={text}
        onChange={(e) => { setText(e.target.value); setError(false); }}
        onPaste={(e) => {
          const value = e.clipboardData.getData('text');
          if (value) { e.preventDefault(); setText(value); submit(value); }
        }}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(text); }}
        placeholder={t('home.linkPlaceholder')}
        aria-label={t('home.linkPlaceholder')}
      />
      {error && <p className="text-xs text-error">{t('home.invalidLink')}</p>}
      {(canPaste || smallScan) && (
        <div className={`grid gap-2 ${canPaste && smallScan ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {canPaste && <IconAction icon={ClipboardPaste} label={t('home.paste')} onClick={paste} wide />}
          {smallScan && <IconAction icon={ScanLine} label={t('home.scan')} onClick={() => setScanning(true)} wide />}
        </div>
      )}
      {scanning && <QrScanner onResult={(value) => { setScanning(false); setText(value); submit(value); }} onClose={() => setScanning(false)} />}
    </div>
  );
}

function QrScanner({ onResult, onClose }: { onResult: (value: string) => void; onClose: () => void }) {
  const { t } = useTranslation('companion');
  const videoRef = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let read: QrReader | null = null;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const scan = async () => {
      const video = videoRef.current;
      if (stopped || !video) return;
      if (read && video.readyState >= 2) {
        try {
          const hit = (await read(video)).find((value) => companionPathOf(value));
          if (hit && !stopped) {
            onResult(hit);
            return;
          }
        } catch {
          // A frame the detector could not read: try the next one
        }
      }
      timer = setTimeout(scan, 250);
    };

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then(async (s) => {
        if (stopped) { s.getTracks().forEach((track) => track.stop()); return; }
        // Kept first: the cleanup stops the camera whatever happens next
        stream = s;
        read = await qrReader();
        const video = videoRef.current;
        if (stopped || !video) return;
        video.srcObject = s;
        await video.play();
        void scan();
      })
      .catch(() => setFailed(true));

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [onResult]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <video ref={videoRef} className="flex-1 w-full object-cover" playsInline muted />
      {/* Viewfinder */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="w-60 h-60 rounded border-2 border-white/80" />
      </div>
      {failed && (
        <p className="absolute top-1/2 inset-x-0 -translate-y-1/2 text-center text-sm text-white px-8">{t('home.cameraUnavailable')}</p>
      )}
      <button
        type="button"
        onClick={onClose}
        className="absolute right-3 w-11 h-11 flex items-center justify-center rounded-full bg-black/50 text-white top-[calc(env(safe-area-inset-top)+0.75rem)]"
        aria-label={t('close')}
      >
        <X size={22} />
      </button>
    </div>
  );
}

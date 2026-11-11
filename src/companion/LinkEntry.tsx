/**
 * Opening a share link from inside the companion: paste it, or scan the QR
 * code with the page's own scanner (where the browser has BarcodeDetector:
 * Chrome on Android; elsewhere the phone's camera app does it).
 * Desktop links (/join/…) are accepted too: same parts as /m/ links.
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ClipboardPaste, ScanLine, X } from 'lucide-react';
import { companionPathOf, openLink } from './shareLink';
import { inputClass, secondaryButton } from './ui';

type Detector = { detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> };
type DetectorCtor = new (options: { formats: string[] }) => Detector;

function barcodeDetector(): DetectorCtor | null {
  return (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector ?? null;
}

export function LinkEntry() {
  const { t } = useTranslation('companion');
  const [text, setText] = useState('');
  const [error, setError] = useState(false);
  const [scanning, setScanning] = useState(false);
  const canScan = !!barcodeDetector() && !!navigator.mediaDevices?.getUserMedia;
  const canPaste = !!navigator.clipboard?.readText;

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
      <div className="flex gap-2">
        {canPaste && (
          <button type="button" className={`${secondaryButton} flex-1`} onClick={paste}>
            <ClipboardPaste size={16} />
            {t('home.paste')}
          </button>
        )}
        {canScan && (
          <button type="button" className={`${secondaryButton} flex-1`} onClick={() => setScanning(true)}>
            <ScanLine size={16} />
            {t('home.scan')}
          </button>
        )}
      </div>
      {scanning && <QrScanner onResult={(value) => { setScanning(false); setText(value); submit(value); }} onClose={() => setScanning(false)} />}
    </div>
  );
}

function QrScanner({ onResult, onClose }: { onResult: (value: string) => void; onClose: () => void }) {
  const { t } = useTranslation('companion');
  const videoRef = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const Ctor = barcodeDetector();
    if (!Ctor) return;
    const detector = new Ctor({ formats: ['qr_code'] });
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const scan = async () => {
      const video = videoRef.current;
      if (stopped || !video) return;
      if (video.readyState >= 2) {
        try {
          const codes = await detector.detect(video);
          const hit = codes.find((c) => companionPathOf(c.rawValue));
          if (hit && !stopped) {
            onResult(hit.rawValue);
            return;
          }
        } catch {
          // A frame the detector could not read: try the next one
        }
      }
      timer = setTimeout(scan, 250);
    };

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((s) => {
        if (stopped) { s.getTracks().forEach((track) => track.stop()); return; }
        stream = s;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = s;
        void video.play().then(scan).catch(() => setFailed(true));
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

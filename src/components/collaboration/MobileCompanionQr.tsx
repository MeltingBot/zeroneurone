/**
 * QR code of the mobile companion link for the dossier being shared. Uses the
 * current key (a new share() would invalidate every link already given).
 * Async sessions only: the relay keeps no copy of the dossier, so without
 * buffering a phone's captures would only arrive while a computer is online.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Smartphone } from 'lucide-react';
import { syncService } from '../../services/syncService';
import { Button } from '../common/Button';

interface MobileCompanionQrProps {
  dossierId: string;
  encryptionKey: string;
  asyncEnabled: boolean;
}

/** SVG path drawing the dark modules, one unit per module */
function qrPath(isDark: (row: number, col: number) => boolean, size: number): string {
  let d = '';
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (isDark(row, col)) d += `M${col} ${row}h1v1h-1z`;
    }
  }
  return d;
}

export function MobileCompanionQr({ dossierId, encryptionKey, asyncEnabled }: MobileCompanionQrProps) {
  const { t } = useTranslation('modals');
  const [open, setOpen] = useState(false);
  const [qr, setQr] = useState<{ path: string; size: number } | null>(null);

  useEffect(() => {
    if (!open || !asyncEnabled) return;
    let cancelled = false;
    (async () => {
      const [{ default: qrcode }, url] = await Promise.all([
        import('qrcode-generator'),
        syncService.buildShareUrl(dossierId, encryptionKey, undefined, true, 'm', undefined, true),
      ]);
      const code = qrcode(0, 'M');
      code.addData(url);
      code.make();
      const size = code.getModuleCount();
      if (!cancelled) setQr({ path: qrPath((r, c) => code.isDark(r, c), size), size });
    })().catch((err: unknown) => console.warn('[ShareModal] QR code failed:', err));
    return () => { cancelled = true; };
  }, [open, asyncEnabled, dossierId, encryptionKey]);

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)} className="w-full">
        <Smartphone size={16} />
        {t('collaboration.mobile.open')}
      </Button>
    );
  }

  if (!asyncEnabled) {
    return <p className="text-xs text-warning bg-warning/10 px-3 py-2 rounded">{t('collaboration.mobile.asyncRequired')}</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-center">
        {qr ? (
          // White box whatever the theme: phone cameras need dark modules on light
          <svg
            viewBox={`-4 -4 ${qr.size + 8} ${qr.size + 8}`}
            width={232}
            height={232}
            role="img"
            aria-label={t('collaboration.mobile.qrLabel')}
            className="rounded border border-border-default"
            shapeRendering="crispEdges"
          >
            <rect x={-4} y={-4} width={qr.size + 8} height={qr.size + 8} fill="#ffffff" />
            <path d={qr.path} fill="#000000" />
          </svg>
        ) : (
          <div className="w-[232px] h-[232px] rounded border border-border-default bg-bg-secondary" />
        )}
      </div>
      <p className="text-xs text-text-tertiary text-center">{t('collaboration.mobile.scan')}</p>
    </div>
  );
}

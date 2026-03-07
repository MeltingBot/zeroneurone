import { useEffect, useRef, useState, useCallback } from 'react';
import { useUIStore } from '../stores';

/**
 * Opens a detached browser window and returns a container element for createPortal.
 * Handles stylesheet cloning, theme sync, close detection, and cleanup.
 */
export function useDetachedWindow(
  enabled: boolean,
  onClose: () => void
): HTMLElement | null {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const popupRef = useRef<Window | null>(null);
  const pollRef = useRef<number>(0);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const cleanup = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = 0;
    }
    if (popupRef.current && !popupRef.current.closed) {
      popupRef.current.close();
    }
    popupRef.current = null;
    setContainer(null);
  }, []);

  useEffect(() => {
    if (!enabled) {
      cleanup();
      return;
    }

    // Open popup
    const width = 460;
    const height = 700;
    const left = window.screenX + window.outerWidth - width - 20;
    const top = window.screenY + 80;
    const popup = window.open(
      '',
      'zn-panel',
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=no`
    );

    if (!popup) {
      useUIStore.getState().showToast('warning', 'Popup blocked by browser');
      onCloseRef.current();
      return;
    }

    popupRef.current = popup;

    // Build stylesheet links from main document
    const stylesheetTags: string[] = [];
    const inlineStyles: string[] = [];
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        if (sheet.href) {
          stylesheetTags.push(`<link rel="stylesheet" href="${sheet.href}">`);
        } else if (sheet.cssRules) {
          const rules = Array.from(sheet.cssRules).map(r => r.cssText).join('\n');
          inlineStyles.push(`<style>${rules}</style>`);
        }
      } catch {
        // Cross-origin stylesheet, skip
      }
    }

    // Copy theme and class from main document
    const theme = document.documentElement.getAttribute('data-theme') || '';
    const htmlClass = document.documentElement.className;
    const bodyClass = document.body.className;

    // Write a proper HTML document
    const doc = popup.document;
    doc.open();
    doc.write(`<!DOCTYPE html>
<html${htmlClass ? ` class="${htmlClass}"` : ''}${theme ? ` data-theme="${theme}"` : ''}>
<head>
  <meta charset="utf-8">
  <title>Panel — ZeroNeurone</title>
  ${stylesheetTags.join('\n  ')}
  ${inlineStyles.join('\n  ')}
  <style>
    body { margin: 0; overflow: hidden; }
    #zn-panel-root { height: 100vh; display: flex; flex-direction: column; }
  </style>
</head>
<body class="${bodyClass}">
  <div id="zn-panel-root"></div>
</body>
</html>`);
    doc.close();

    // Wait for stylesheets to load, then mount container
    const linkElements = Array.from(doc.querySelectorAll('link[rel="stylesheet"]'));
    if (linkElements.length > 0) {
      let loaded = 0;
      const total = linkElements.length;
      const onReady = () => {
        loaded++;
        if (loaded >= total) {
          const div = doc.getElementById('zn-panel-root');
          if (div) setContainer(div);
        }
      };
      for (const link of linkElements) {
        if ((link as HTMLLinkElement).sheet) {
          // Already loaded (cached)
          onReady();
        } else {
          link.addEventListener('load', onReady);
          link.addEventListener('error', onReady); // Don't block on failed loads
        }
      }
      // Fallback: mount after 2s even if some stylesheets didn't load
      setTimeout(() => {
        if (!container) {
          const div = doc.getElementById('zn-panel-root');
          if (div) setContainer(div);
        }
      }, 2000);
    } else {
      // No external stylesheets, mount immediately
      const div = doc.getElementById('zn-panel-root');
      if (div) setContainer(div);
    }

    // Poll for manual close
    pollRef.current = window.setInterval(() => {
      if (popup.closed) {
        cleanup();
        onCloseRef.current();
      }
    }, 500);

    // Close popup when main window unloads
    const handleUnload = () => {
      cleanup();
    };
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      cleanup();
    };
  }, [enabled, cleanup]);

  return container;
}

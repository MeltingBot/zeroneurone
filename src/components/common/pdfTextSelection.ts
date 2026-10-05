/**
 * Keeps a text selection from running away when the pointer leaves the text.
 *
 * Text layer spans are absolutely positioned over empty space. Dragging from
 * a word into a gap leaves the browser to guess the nearest text position:
 * Firefox jumps back to the start of the layer (selecting the paragraphs
 * above), Chromium runs on through the lines below. pdf.js answers with an
 * unselectable `.endOfContent` element stretched over the layer while a
 * selection is under way (see index.css), and, for older Chromium, moves it
 * next to the selection's moving end.
 *
 * Ported from TextLayerBuilder in pdfjs-dist/web/pdf_viewer.mjs, which the
 * plain TextLayer class does not include.
 */

const textLayers = new Map<HTMLElement, HTMLElement>();
let selectionListeners: AbortController | null = null;

/** Wires up `textLayerDiv`, once its spans are in. Returns the teardown. */
export function registerTextLayer(textLayerDiv: HTMLElement): () => void {
  const end = document.createElement('div');
  end.className = 'endOfContent';
  textLayerDiv.append(end);

  const onMouseDown = (event: MouseEvent) => {
    // A double click in a gap selects a word picked by the browser — in
    // Firefox the page's first one. Only text spans may start a word or line
    // selection.
    if (event.detail > 1 && !(event.target as Element).closest?.('.textLayer span')) {
      event.preventDefault();
      return;
    }
    textLayerDiv.classList.add('selecting');
  };
  textLayerDiv.addEventListener('mousedown', onMouseDown);
  textLayers.set(textLayerDiv, end);
  enableGlobalSelectionListener();

  return () => {
    textLayerDiv.removeEventListener('mousedown', onMouseDown);
    textLayerDiv.classList.remove('selecting');
    end.remove();
    textLayers.delete(textLayerDiv);
    if (textLayers.size === 0) {
      selectionListeners?.abort();
      selectionListeners = null;
    }
  };
}

function reset(end: HTMLElement, textLayer: HTMLElement): void {
  textLayer.append(end);
  end.style.width = '';
  end.style.height = '';
  end.style.userSelect = '';
  textLayer.classList.remove('selecting');
}

function enableGlobalSelectionListener(): void {
  if (selectionListeners) return;
  selectionListeners = new AbortController();
  const { signal } = selectionListeners;

  let isPointerDown = false;
  document.addEventListener('pointerdown', () => {
    isPointerDown = true;
  }, { signal });
  document.addEventListener('pointerup', () => {
    isPointerDown = false;
    textLayers.forEach(reset);
  }, { signal });
  window.addEventListener('blur', () => {
    isPointerDown = false;
    textLayers.forEach(reset);
  }, { signal });
  document.addEventListener('keyup', () => {
    if (!isPointerDown) textLayers.forEach(reset);
  }, { signal });

  let selectsNatively: boolean | undefined;
  let prevRange: Range | undefined;
  document.addEventListener('selectionchange', () => {
    const selection = document.getSelection();
    if (!selection || selection.rangeCount === 0) {
      textLayers.forEach(reset);
      return;
    }

    // Stretch the end element over every layer the selection touches
    const activeTextLayers = new Set<HTMLElement>();
    for (let i = 0; i < selection.rangeCount; i++) {
      const range = selection.getRangeAt(i);
      for (const textLayerDiv of textLayers.keys()) {
        if (!activeTextLayers.has(textLayerDiv) && range.intersectsNode(textLayerDiv)) {
          activeTextLayers.add(textLayerDiv);
        }
      }
    }
    for (const [textLayerDiv, end] of textLayers) {
      if (activeTextLayers.has(textLayerDiv)) textLayerDiv.classList.add('selecting');
      else reset(end, textLayerDiv);
    }

    // Firefox and Chromium 148+ are content with the stretched element
    if (selectsNatively === undefined) {
      const chromium = /\bChrome\/(\d+)\b/.exec(navigator.userAgent)?.[1];
      selectsNatively = navigator.userAgent.includes('Firefox')
        || (!!chromium && parseInt(chromium, 10) >= 148);
    }
    if (selectsNatively) return;

    // Older Chromium: put the end element right after the selection's moving
    // end, so the gap past it resolves to that point instead of further on.
    const range = selection.getRangeAt(0);
    const modifyStart = prevRange && (
      range.compareBoundaryPoints(Range.END_TO_END, prevRange) === 0
      || range.compareBoundaryPoints(Range.START_TO_END, prevRange) === 0
    );
    let anchor: Node = modifyStart ? range.startContainer : range.endContainer;
    if (anchor.nodeType === Node.TEXT_NODE && anchor.parentNode) anchor = anchor.parentNode;
    // A search match wraps text inside the item span
    if ((anchor as Element).classList?.contains('pdf-match') && anchor.parentNode) anchor = anchor.parentNode;
    if (!modifyStart && range.endOffset === 0) {
      do {
        while (!anchor.previousSibling) {
          if (!anchor.parentNode) return;
          anchor = anchor.parentNode;
        }
        anchor = anchor.previousSibling;
      } while (!anchor.childNodes.length);
    }

    const parentTextLayer = anchor.parentElement?.closest<HTMLElement>('.textLayer');
    const end = parentTextLayer ? textLayers.get(parentTextLayer) : undefined;
    if (parentTextLayer && end && anchor.parentElement) {
      end.style.width = parentTextLayer.style.width;
      end.style.height = parentTextLayer.style.height;
      end.style.userSelect = 'text';
      anchor.parentElement.insertBefore(end, modifyStart ? anchor : anchor.nextSibling);
    }
    prevRange = range.cloneRange();
  }, { signal });
}

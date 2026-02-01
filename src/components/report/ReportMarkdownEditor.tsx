import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil, Check, Lock } from 'lucide-react';
import { ElementAutocomplete } from './ElementAutocomplete';
import { sanitizeLinkLabel } from '../../utils';
import { useInvestigationStore, useSelectionStore, useViewStore, useSyncStore } from '../../stores';

interface ReportMarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  onEditingChange?: (editing: boolean) => void;
  sectionId: string;
  placeholder?: string;
  minRows?: number;
}

interface AutocompleteState {
  query: string;
  position: { top: number; left: number };
  triggerStart: number; // Position in text where [[ started
}

// Regex to match [[Label|uuid]] element links
const LINK_REGEX = /\[\[([^\]|]+)\|([a-fA-F0-9-]+)\]\]/g;

// Parse content into segments (text and links)
interface TextSegment {
  type: 'text';
  content: string;
  start: number;
  end: number;
}

interface LinkSegment {
  type: 'link';
  content: string;
  label: string;
  id: string;
  start: number;
  end: number;
}

type Segment = TextSegment | LinkSegment;

function parseContent(content: string): Segment[] {
  const segments: Segment[] = [];
  const regex = new RegExp(LINK_REGEX.source, 'g');
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        content: content.slice(lastIndex, match.index),
        start: lastIndex,
        end: match.index,
      });
    }
    segments.push({
      type: 'link',
      content: match[0],
      label: match[1],
      id: match[2],
      start: match.index,
      end: regex.lastIndex,
    });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < content.length) {
    segments.push({
      type: 'text',
      content: content.slice(lastIndex),
      start: lastIndex,
      end: content.length,
    });
  }

  return segments;
}

// Serialize contenteditable DOM back to raw format
function serializeContent(element: HTMLElement): string {
  let result = '';

  const processNode = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      // Strip zero-width spaces used for cursor positioning
      result += (node.textContent || '').replace(/\u200B/g, '');
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;

      // Check if it's a link span
      if (el.hasAttribute('data-link-id')) {
        const id = el.getAttribute('data-link-id');
        const label = el.getAttribute('data-link-label');
        result += `[[${label}|${id}]]`;
      } else if (el.tagName === 'BR') {
        result += '\n';
      } else if (el.tagName === 'DIV' && result.length > 0 && !result.endsWith('\n')) {
        // DIVs in contenteditable often represent line breaks
        result += '\n';
        el.childNodes.forEach(processNode);
      } else {
        el.childNodes.forEach(processNode);
      }
    }
  };

  element.childNodes.forEach(processNode);
  return result;
}

// Get caret position in pixels
function getCaretCoordinates(editorElement?: HTMLElement | null): { top: number; left: number } | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  // Check if rect has valid dimensions (can be 0,0 in some edge cases)
  if (rect.top === 0 && rect.left === 0 && rect.bottom === 0 && rect.right === 0) {
    // Fallback: use editor element position if available
    if (editorElement) {
      const editorRect = editorElement.getBoundingClientRect();
      return {
        top: editorRect.top + 24, // Below first line
        left: editorRect.left,
      };
    }
    return null;
  }

  return {
    top: rect.bottom + 4,
    left: Math.min(rect.left, window.innerWidth - 300),
  };
}

// Get text position from the start of contenteditable, accounting for link spans
// Returns position in the SERIALIZED content (where links are [[Label|uuid]])
function getTextPosition(element: HTMLElement): number {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return 0;

  const range = selection.getRangeAt(0);
  let position = 0;
  let found = false;

  const walkNodes = (node: Node): boolean => {
    if (found) return true;

    if (node === range.startContainer) {
      // Found the cursor node
      if (node.nodeType === Node.TEXT_NODE) {
        // Count characters before cursor, excluding zero-width spaces
        const textBefore = (node.textContent || '').slice(0, range.startOffset);
        position += textBefore.replace(/\u200B/g, '').length;
      }
      found = true;
      return true;
    }

    if (node.nodeType === Node.TEXT_NODE) {
      // Exclude zero-width spaces from position calculation
      position += (node.textContent || '').replace(/\u200B/g, '').length;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;

      if (el.hasAttribute('data-link-id')) {
        // Link span: count the serialized length [[label|id]]
        const id = el.getAttribute('data-link-id') || '';
        const label = el.getAttribute('data-link-label') || '';
        position += `[[${label}|${id}]]`.length;
      } else if (el.tagName === 'BR') {
        position += 1; // newline
      } else {
        // Recurse into children
        for (const child of Array.from(el.childNodes)) {
          if (walkNodes(child)) return true;
        }
      }
    }

    return false;
  };

  for (const child of Array.from(element.childNodes)) {
    if (walkNodes(child)) break;
  }

  return position;
}

// Set caret position based on serialized content position
// This is the inverse of getTextPosition
function setCaretToSerializedPosition(element: HTMLElement, targetPosition: number): void {
  let currentPosition = 0;
  let targetNode: Node | null = null;
  let targetOffset = 0;
  let lastLinkSpan: HTMLElement | null = null;

  const walkNodes = (node: Node): boolean => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      // Get effective length (excluding zero-width spaces)
      const effectiveText = text.replace(/\u200B/g, '');
      const effectiveLength = effectiveText.length;

      if (currentPosition + effectiveLength >= targetPosition) {
        // Target is within this text node
        // Need to map effective position to actual position (including zero-width spaces)
        targetNode = node;
        const effectiveOffset = targetPosition - currentPosition;
        // Find actual offset by counting characters until we reach effectiveOffset non-ZWSP characters
        let actualOffset = 0;
        let effectiveCount = 0;
        for (let i = 0; i < text.length && effectiveCount < effectiveOffset; i++) {
          actualOffset = i + 1;
          if (text[i] !== '\u200B') {
            effectiveCount++;
          }
        }
        targetOffset = actualOffset;
        return true;
      }
      currentPosition += effectiveLength;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;

      if (el.hasAttribute('data-link-id')) {
        // Link span: count the serialized length [[label|id]]
        const id = el.getAttribute('data-link-id') || '';
        const label = el.getAttribute('data-link-label') || '';
        const linkLength = `[[${label}|${id}]]`.length;

        if (currentPosition + linkLength >= targetPosition) {
          // Target is at or after this link - position cursor after the span
          lastLinkSpan = el;
          const nextSibling = el.nextSibling;
          if (nextSibling && nextSibling.nodeType === Node.TEXT_NODE) {
            targetNode = nextSibling;
            targetOffset = 0;
          } else {
            // No text node after - we'll create one
            targetNode = null;
          }
          return true;
        }
        currentPosition += linkLength;
        lastLinkSpan = el;
      } else if (el.tagName === 'BR') {
        if (currentPosition + 1 >= targetPosition) {
          // Position after the BR
          const nextSibling = el.nextSibling;
          if (nextSibling && nextSibling.nodeType === Node.TEXT_NODE) {
            targetNode = nextSibling;
            targetOffset = 0;
          } else {
            targetNode = el.parentNode;
            targetOffset = Array.from(el.parentNode?.childNodes || []).indexOf(el) + 1;
          }
          return true;
        }
        currentPosition += 1;
      } else {
        // Recurse into children
        for (const child of Array.from(el.childNodes)) {
          if (walkNodes(child)) return true;
        }
      }
    }
    return false;
  };

  for (const child of Array.from(element.childNodes)) {
    if (walkNodes(child)) break;
  }

  // If we didn't find a text node after a link, create one
  if (!targetNode && lastLinkSpan !== null) {
    // TypeScript can't track mutations inside closures, so we assert the type here
    const span: HTMLElement = lastLinkSpan;
    const textNode = document.createTextNode('\u200B'); // Zero-width space
    if (span.nextSibling) {
      span.parentNode?.insertBefore(textNode, span.nextSibling);
    } else {
      span.parentNode?.appendChild(textNode);
    }
    targetNode = textNode;
    targetOffset = 1; // After the zero-width space
  }

  // If we still didn't find a position, place cursor at end
  if (!targetNode) {
    // Ensure there's a text node at the end for typing
    const lastChild = element.lastChild;
    if (!lastChild || lastChild.nodeType !== Node.TEXT_NODE) {
      const textNode = document.createTextNode('\u200B');
      element.appendChild(textNode);
      targetNode = textNode;
      targetOffset = 1;
    } else {
      const range = document.createRange();
      range.selectNodeContents(element);
      range.collapse(false);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      return;
    }
  }

  try {
    const range = document.createRange();
    if (targetNode.nodeType === Node.TEXT_NODE) {
      range.setStart(targetNode, Math.min(targetOffset, targetNode.textContent?.length || 0));
      range.setEnd(targetNode, Math.min(targetOffset, targetNode.textContent?.length || 0));
    } else {
      range.setStart(targetNode, Math.min(targetOffset, targetNode.childNodes.length));
      range.setEnd(targetNode, Math.min(targetOffset, targetNode.childNodes.length));
    }
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  } catch {
    // Fallback: place cursor at end
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }
}

// Size mapping for element visual size
const SIZE_MAP: Record<string, number> = { small: 40, medium: 56, large: 72 };
function getElementSizePixels(size: string | number | undefined): number {
  if (typeof size === 'number') return size;
  if (typeof size === 'string') return SIZE_MAP[size] ?? 56;
  return 56;
}

export function ReportMarkdownEditor({
  value,
  onChange,
  onEditingChange,
  sectionId,
  placeholder = 'Markdown: **bold**, *italic*, [link](url)... Type [[ to reference elements.',
  minRows = 6,
}: ReportMarkdownEditorProps) {
  const { t } = useTranslation('panels');
  const { elements, links } = useInvestigationStore();
  const { selectElement, clearSelection } = useSelectionStore();
  const { requestViewportChange, setDisplayMode, displayMode } = useViewStore();
  const { remoteUsers, updateEditingReportSection } = useSyncStore();

  // Check if another user is editing this section
  const lockingUser = useMemo(() => {
    return remoteUsers.find((user) => user.editingReportSection === sectionId);
  }, [remoteUsers, sectionId]);
  const isLockedByOther = !!lockingUser;

  // Build maps for element navigation
  const elementMap = useMemo(() => new Map(elements.map((el) => [el.id, el])), [elements]);
  const linkMap = useMemo(() => new Map(links.map((link) => [link.id, link])), [links]);

  // Build set of existing IDs for link validation
  const existingIds = useMemo(() => {
    const ids = new Set<string>();
    elements.forEach((el) => ids.add(el.id));
    links.forEach((link) => ids.add(link.id));
    return ids;
  }, [elements, links]);

  // States
  const [isWriteMode, setIsWriteMode] = useState(false); // false = read mode (links navigate), true = write mode (edit text)
  const [localContent, setLocalContent] = useState(value); // Local buffer for editing (synced only on validate)
  const [autocomplete, setAutocomplete] = useState<AutocompleteState | null>(null);
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const isUpdatingRef = useRef(false);
  const justClickedLinkRef = useRef(false);
  const previousEditingLinkIdRef = useRef<string | null>(null);
  const pendingCursorPositionRef = useRef<number | null>(null);
  // Track the content we sent to parent to detect our own echoes vs remote updates
  const lastSentContentRef = useRef<string | null>(null);
  // Track localContent in a ref to avoid effect dependencies causing re-triggers
  const localContentRef = useRef(localContent);
  localContentRef.current = localContent;

  // Sync localContent from value when in read mode (for remote updates)
  // Only sync if it's a genuine remote update, not our own echo
  // IMPORTANT: Only depends on `value` and `isWriteMode` to avoid re-triggering on localContent changes
  useEffect(() => {
    // In write mode, don't sync from value (user is editing)
    if (isWriteMode) return;

    // If we have pending sent content, wait for value to match it before accepting updates
    // This prevents flash when exiting write mode before parent has updated
    if (lastSentContentRef.current !== null) {
      if (value === lastSentContentRef.current) {
        // Our sent content has arrived - sync localContent and clear the flag
        setLocalContent(value);
        lastSentContentRef.current = null;
      }
      // Don't accept other updates while waiting for our content to sync
      return;
    }

    // Remote update - sync localContent from value (use ref to get current value without dependency)
    if (value !== localContentRef.current) {
      setLocalContent(value);
    }
  }, [value, isWriteMode]);

  // Parse content into segments - only needed for read mode display
  // In write mode, the DOM is managed by contenteditable directly
  const segments = useMemo(() => {
    // Don't bother parsing in write mode - we won't use it
    if (isWriteMode) return [];
    return parseContent(localContent);
  }, [localContent, isWriteMode]);

  // Sync value to contenteditable
  useEffect(() => {
    if (!editorRef.current || isUpdatingRef.current) return;

    // IMPORTANT: Don't rebuild DOM while user is typing (write mode)
    // This prevents glitches from Yjs sync overwriting user input
    if (isWriteMode) return;

    // Don't rebuild if we just clicked a link to edit it
    if (justClickedLinkRef.current) {
      justClickedLinkRef.current = false;
      previousEditingLinkIdRef.current = editingLinkId;
      return;
    }

    // Force rebuild when editingLinkId changes from a value to null (link editing finished)
    const wasEditingLink = previousEditingLinkIdRef.current !== null;
    const stoppedEditing = wasEditingLink && editingLinkId === null;
    previousEditingLinkIdRef.current = editingLinkId;

    // Only update if the serialized content differs from what we want to render
    const currentContent = serializeContent(editorRef.current);

    // Check if DOM needs link transformation (has [[...]] patterns but no link spans)
    // This forces rebuild when exiting write mode to convert raw text to clickable links
    // Use a fresh regex to avoid lastIndex issues with global flag
    const hasLinkPatterns = new RegExp(LINK_REGEX.source).test(localContent);
    const hasLinkSpans = editorRef.current.querySelector('[data-link-id]') !== null;
    const needsLinkTransformation = hasLinkPatterns && !hasLinkSpans;

    if (!needsLinkTransformation && currentContent === localContent && !stoppedEditing) return;

    // Build new content in a DocumentFragment first to avoid flash
    // (atomic replacement instead of clear + rebuild)
    const fragment = document.createDocumentFragment();

    segments.forEach((segment) => {
      if (segment.type === 'text') {
        // Split by newlines to handle line breaks
        const lines = segment.content.split('\n');
        lines.forEach((line, i) => {
          if (i > 0) {
            fragment.appendChild(document.createElement('br'));
          }
          if (line) {
            fragment.appendChild(document.createTextNode(line));
          }
        });
      } else {
        // If this link is being edited, show raw text instead
        if (segment.id === editingLinkId) {
          fragment.appendChild(document.createTextNode(segment.content));
        } else {
          // Create link span
          const span = document.createElement('span');
          span.setAttribute('data-link-id', segment.id);
          span.setAttribute('data-link-label', segment.label);
          span.className = existingIds.has(segment.id)
            ? 'text-accent font-medium cursor-pointer hover:underline select-none'
            : 'line-through text-text-tertiary select-none';
          span.contentEditable = 'false';
          span.textContent = segment.label;

          if (!existingIds.has(segment.id)) {
            const deleted = document.createElement('span');
            deleted.className = 'text-xs ml-1';
            deleted.textContent = '(deleted)';
            span.appendChild(deleted);
          }

          fragment.appendChild(span);
        }
      }
    });

    // Atomic replacement - clear and append in one go
    editorRef.current.innerHTML = '';
    if (fragment.childNodes.length > 0) {
      editorRef.current.appendChild(fragment);
    }

    // Ensure there's always a text node at the end for cursor positioning
    // This allows typing after the last link
    const lastChild = editorRef.current.lastChild;
    if (lastChild && (lastChild.nodeType !== Node.TEXT_NODE || lastChild.textContent === '')) {
      editorRef.current.appendChild(document.createTextNode('\u200B'));
    }
  // Note: Don't add `value` to dependencies - it's already captured in `segments` via localContent
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments, existingIds, editingLinkId, isWriteMode]);

  // Position cursor after DOM rebuild (for autocomplete insertion)
  useEffect(() => {
    if (pendingCursorPositionRef.current !== null && editorRef.current) {
      const targetPosition = pendingCursorPositionRef.current;
      pendingCursorPositionRef.current = null;

      // Use requestAnimationFrame to ensure DOM is fully updated
      requestAnimationFrame(() => {
        if (editorRef.current) {
          editorRef.current.focus();
          setCaretToSerializedPosition(editorRef.current, targetPosition);
        }
      });
    }
  }, [value, localContent]);

  // Handle input in contenteditable
  // Optimized: only check for [[ trigger near cursor, defer full serialization to validation
  const handleInput = useCallback(() => {
    if (!editorRef.current) return;

    isUpdatingRef.current = true;

    // Get text before cursor directly from selection (fast, no DOM walk)
    const selection = window.getSelection();
    let textBeforeCursor = '';
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const node = range.startContainer;
      if (node.nodeType === Node.TEXT_NODE) {
        textBeforeCursor = (node.textContent || '').slice(0, range.startOffset);
      }
    }

    // Check for [[ trigger in the immediate text before cursor
    const match = textBeforeCursor.match(/\[\[([^\]|]*)$/);

    if (match) {
      const coords = getCaretCoordinates(editorRef.current);
      if (coords) {
        // Only serialize when we need triggerStart for autocomplete insertion
        const textPos = getTextPosition(editorRef.current);
        setAutocomplete({
          query: match[1],
          position: coords,
          triggerStart: textPos - match[1].length - 2,
        });
      }
    } else if (autocomplete) {
      // Close autocomplete if it was open
      setAutocomplete(null);
    }

    // Check if editing link was deleted (only if we're tracking one)
    if (editingLinkId) {
      // Quick check: if the current text node doesn't contain the link pattern,
      // do a full check by looking for the link span in DOM
      const hasLinkSpan = editorRef.current.querySelector(`[data-link-id="${editingLinkId}"]`);
      const hasRawLink = editorRef.current.textContent?.includes(`|${editingLinkId}]]`);
      if (!hasLinkSpan && !hasRawLink) {
        setEditingLinkId(null);
      }
    }

    setTimeout(() => {
      isUpdatingRef.current = false;
    }, 0);
  }, [editingLinkId, autocomplete]);

  // Handle keyup for autocomplete detection
  const handleKeyUp = useCallback(() => {
    if (!editorRef.current || autocomplete) return;

    const textPos = getTextPosition(editorRef.current);
    const textBefore = localContent.slice(0, textPos);
    const match = textBefore.match(/\[\[([^\]|]*)$/);

    if (match) {
      const coords = getCaretCoordinates(editorRef.current);
      if (coords) {
        setAutocomplete({
          query: match[1],
          position: coords,
          triggerStart: textPos - match[1].length - 2,
        });
      }
    }
  }, [localContent, autocomplete]);

  // Handle keydown to prevent global shortcuts from firing while typing
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Stop propagation for all keys to prevent global shortcuts (like "?" for help modal)
    // from being triggered while typing in the editor
    e.stopPropagation();

    // Special handling when autocomplete is open
    if (autocomplete) {
      if (e.key === 'Tab' || e.key === 'Escape' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
      }
    }
  }, [autocomplete]);

  // Handle blur
  const handleBlur = useCallback((e: React.FocusEvent) => {
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    if (relatedTarget?.closest('[data-autocomplete]')) {
      return;
    }

    // Reset editing link state on blur
    if (editingLinkId) {
      setEditingLinkId(null);
    }
  }, [editingLinkId]);

  // Navigate to element on canvas
  const navigateToElement = useCallback(
    (id: string) => {
      const element = elementMap.get(id);
      const link = linkMap.get(id);

      if (!element && !link) return;

      // Switch to canvas view if not already
      if (displayMode !== 'canvas') {
        setDisplayMode('canvas');
      }

      clearSelection();

      if (element) {
        selectElement(element.id);

        // Center viewport on element
        const targetZoom = 1.0;
        const canvasWidth = window.innerWidth - 350;
        const canvasHeight = window.innerHeight;
        const elementWidth = getElementSizePixels(element.visual?.size);
        const elementHeight = Math.round(elementWidth * 0.4);
        const centerX = element.position.x + elementWidth / 2;
        const centerY = element.position.y + elementHeight / 2;

        setTimeout(() => {
          requestViewportChange({
            x: -centerX * targetZoom + canvasWidth / 2,
            y: -centerY * targetZoom + canvasHeight / 2,
            zoom: targetZoom,
          });
        }, 50);
      } else if (link) {
        // For links, select both connected elements
        selectElement(link.fromId);
        selectElement(link.toId);

        // Center on midpoint between the two elements
        const fromEl = elementMap.get(link.fromId);
        const toEl = elementMap.get(link.toId);
        if (fromEl && toEl) {
          const centerX = (fromEl.position.x + toEl.position.x) / 2;
          const centerY = (fromEl.position.y + toEl.position.y) / 2;
          const targetZoom = 0.8;
          const canvasWidth = window.innerWidth - 350;
          const canvasHeight = window.innerHeight;

          setTimeout(() => {
            requestViewportChange({
              x: -centerX * targetZoom + canvasWidth / 2,
              y: -centerY * targetZoom + canvasHeight / 2,
              zoom: targetZoom,
            });
          }, 50);
        }
      }
    },
    [elementMap, linkMap, selectElement, clearSelection, requestViewportChange, setDisplayMode, displayMode]
  );

  // Release lock on unmount or when leaving write mode unexpectedly
  useEffect(() => {
    return () => {
      if (isWriteMode) {
        updateEditingReportSection(null);
        onEditingChange?.(false);
      }
    };
  }, [isWriteMode, updateEditingReportSection, onEditingChange]);

  // Toggle write mode
  const handleToggleWriteMode = useCallback(() => {
    // Don't allow entering write mode if locked by another user
    if (!isWriteMode && isLockedByOther) {
      return;
    }

    if (isWriteMode) {
      // Exiting write mode - sync local content to parent and reset editing state
      setEditingLinkId(null);
      // Release the collaborative lock
      updateEditingReportSection(null);
      // IMPORTANT: Call onChange BEFORE onEditingChange to ensure lastSentContentRef is set
      // before parent stops ignoring Yjs updates
      // Serialize content now (deferred from handleInput for performance)
      const currentContent = editorRef.current ? serializeContent(editorRef.current) : value;
      if (currentContent !== value) {
        // Track what we sent so we can detect our echo vs remote updates
        lastSentContentRef.current = currentContent;
        onChange(currentContent);
      }
      // Notify parent we're no longer editing (after content is sent)
      onEditingChange?.(false);
    } else {
      // Entering write mode - acquire the collaborative lock
      updateEditingReportSection(sectionId);
      // Notify parent we're starting to edit
      onEditingChange?.(true);
      // Copy current value to local buffer
      setLocalContent(value);
      // Focus editor
      setTimeout(() => {
        if (editorRef.current) {
          editorRef.current.focus();
          // Place cursor at end
          const range = document.createRange();
          range.selectNodeContents(editorRef.current);
          range.collapse(false);
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
        }
      }, 0);
    }
    setIsWriteMode(!isWriteMode);
  }, [isWriteMode, isLockedByOther, value, onChange, onEditingChange, sectionId, updateEditingReportSection]);

  // Handle click in editor
  const handleEditorClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const linkSpan = target.closest('[data-link-id]') as HTMLElement | null;

    if (linkSpan) {
      e.preventDefault();
      const linkId = linkSpan.getAttribute('data-link-id');
      const linkLabel = linkSpan.getAttribute('data-link-label');

      if (!linkId || !linkLabel) return;

      if (isWriteMode) {
        // Write mode: reveal raw [[]] format for editing
        if (!editorRef.current) return;

        setEditingLinkId(linkId);
        justClickedLinkRef.current = true;

        // Replace span with raw text
        const rawText = `[[${linkLabel}|${linkId}]]`;
        const textNode = document.createTextNode(rawText);
        linkSpan.parentNode?.replaceChild(textNode, linkSpan);

        // Position cursor at the start of the raw text
        const range = document.createRange();
        range.setStart(textNode, 2); // After [[
        range.setEnd(textNode, 2);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);

        editorRef.current.focus();
      } else {
        // Read mode: navigate to element
        if (existingIds.has(linkId)) {
          navigateToElement(linkId);
        }
      }
    } else if (isWriteMode) {
      // Clicked outside a link in write mode - reset editing state
      if (editingLinkId) {
        setEditingLinkId(null);
      }
    }
  }, [isWriteMode, editingLinkId, existingIds, navigateToElement]);

  // Handle autocomplete selection
  const handleAutocompleteSelect = useCallback(
    (item: { type: string; id: string; label: string }) => {
      if (!editorRef.current || !autocomplete) return;

      const { triggerStart, query } = autocomplete;

      const rawLabel = item.type === 'link'
        ? item.label.split(' (')[0]
        : item.label;
      const safeLabel = sanitizeLinkLabel(rawLabel, item.id);
      const insertion = `[[${safeLabel}|${item.id}]]`;

      // In write mode, we need to update the DOM directly
      // Find and replace the [[query text with the full link
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);

        // Find the text node containing the trigger
        const node = range.startContainer;
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent || '';
          const cursorPos = range.startOffset;

          // Find where [[ starts (should be cursorPos - query.length - 2)
          const triggerPos = cursorPos - query.length - 2;
          if (triggerPos >= 0 && text.slice(triggerPos, cursorPos) === `[[${query}`) {
            // Create new text content
            const before = text.slice(0, triggerPos);
            const after = text.slice(cursorPos);
            node.textContent = before + insertion + after;

            // Position cursor after the insertion
            const newCursorPos = triggerPos + insertion.length;
            range.setStart(node, Math.min(newCursorPos, node.textContent.length));
            range.setEnd(node, Math.min(newCursorPos, node.textContent.length));
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }

        // Sync the DOM change to localContent
        const newContent = serializeContent(editorRef.current);
        setLocalContent(newContent);
      } else {
        // Fallback: update localContent directly (less ideal)
        const before = localContent.slice(0, triggerStart);
        const textPos = getTextPosition(editorRef.current);
        const afterCursor = localContent.slice(textPos);
        const newValue = before + insertion + afterCursor;
        setLocalContent(newValue);
      }

      setAutocomplete(null);
      editorRef.current.focus();
    },
    [localContent, autocomplete]
  );

  const handleAutocompleteClose = useCallback(() => {
    setAutocomplete(null);
    editorRef.current?.focus();
  }, []);

  // Handle paste from canvas
  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      const clipboardText = e.clipboardData?.getData('text/plain') || '';
      const CLIPBOARD_MARKER = '__ZERONEURONE_INTERNAL_COPY__';

      if (!clipboardText.startsWith(CLIPBOARD_MARKER + ':')) {
        // Let default paste happen for regular text
        return;
      }

      // Stop event from bubbling to canvas (which would create new elements)
      e.preventDefault();
      e.stopPropagation();

      try {
        const jsonStr = clipboardText.slice(CLIPBOARD_MARKER.length + 1);
        const data = JSON.parse(jsonStr) as {
          elements: { id: string; label: string }[];
          links: { id: string; label: string }[];
        };

        const parts: string[] = [];
        for (const el of data.elements) {
          const safeLabel = sanitizeLinkLabel(el.label, el.id);
          parts.push(`[[${safeLabel}|${el.id}]]`);
        }
        for (const link of data.links) {
          if (link.label) {
            const safeLabel = sanitizeLinkLabel(link.label, link.id);
            parts.push(`[[${safeLabel}|${link.id}]]`);
          }
        }

        if (parts.length === 0) return;

        const insertion = parts.join(', ');

        // Insert at cursor position
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          range.deleteContents();
          range.insertNode(document.createTextNode(insertion));
          range.collapse(false);

          // Trigger input to update value
          handleInput();
        }
      } catch {
        return;
      }
    },
    [handleInput]
  );

  // Handle copy - serialize selection with [[Label|id]] format for links
  const handleCopy = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return; // No selection, let default behavior
    }

    const range = selection.getRangeAt(0);
    const fragment = range.cloneContents();

    // Serialize the fragment with link format preserved
    let result = '';
    const processNode = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        result += (node.textContent || '').replace(/\u200B/g, '');
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        if (el.hasAttribute('data-link-id')) {
          const id = el.getAttribute('data-link-id');
          const label = el.getAttribute('data-link-label');
          result += `[[${label}|${id}]]`;
        } else if (el.tagName === 'BR') {
          result += '\n';
        } else if (el.tagName === 'DIV' && result.length > 0 && !result.endsWith('\n')) {
          result += '\n';
          el.childNodes.forEach(processNode);
        } else {
          el.childNodes.forEach(processNode);
        }
      }
    };
    fragment.childNodes.forEach(processNode);

    if (result) {
      e.preventDefault();
      e.clipboardData?.setData('text/plain', result);
    }
  }, []);

  return (
    <div className="relative">
      {/* Toggle button */}
      <button
        onClick={handleToggleWriteMode}
        disabled={isLockedByOther}
        className={`absolute top-1 right-1 z-10 p-1 rounded transition-colors ${
          isLockedByOther
            ? 'bg-bg-tertiary text-text-tertiary cursor-not-allowed'
            : isWriteMode
              ? 'bg-accent text-white hover:bg-accent/90'
              : 'bg-bg-tertiary text-text-secondary hover:bg-bg-secondary hover:text-text-primary'
        }`}
        title={
          isLockedByOther
            ? t('report.lockedBy', { name: lockingUser?.name || 'Unknown' })
            : isWriteMode
              ? t('report.validateContent')
              : t('report.editContent')
        }
      >
        {isLockedByOther ? <Lock size={14} /> : isWriteMode ? <Check size={14} /> : <Pencil size={14} />}
      </button>

      {/* Editor */}
      <div
        ref={editorRef}
        contentEditable={isWriteMode}
        onInput={isWriteMode ? handleInput : undefined}
        onKeyUp={isWriteMode ? handleKeyUp : undefined}
        onKeyDown={isWriteMode ? handleKeyDown : undefined}
        onClick={handleEditorClick}
        onBlur={isWriteMode ? handleBlur : undefined}
        onPaste={isWriteMode ? handlePaste : undefined}
        onCopy={handleCopy}
        data-placeholder={placeholder}
        className={`w-full px-3 py-2 pr-8 text-sm bg-bg-secondary border border-border-default rounded text-text-primary whitespace-pre-wrap overflow-auto empty:before:content-[attr(data-placeholder)] empty:before:text-text-tertiary ${
          isWriteMode ? 'focus:outline-none focus:border-accent resize-y' : 'cursor-default'
        }`}
        style={{ minHeight: `${minRows * 24}px` }}
        suppressContentEditableWarning
      />

      {/* Lock indicator below editor */}
      {isLockedByOther && lockingUser && (
        <div
          className="flex items-center gap-1.5 mt-1 px-1 py-0.5 text-xs text-text-secondary"
        >
          <span
            className="w-2 h-2 rounded-full animate-pulse"
            style={{ backgroundColor: lockingUser.color }}
          />
          <span style={{ color: lockingUser.color }}>
            {t('report.lockedBy', { name: lockingUser.name })}
          </span>
        </div>
      )}

      {/* Autocomplete dropdown */}
      {autocomplete && isWriteMode && (
        <ElementAutocomplete
          query={autocomplete.query}
          position={autocomplete.position}
          onSelect={handleAutocompleteSelect}
          onClose={handleAutocompleteClose}
        />
      )}
    </div>
  );
}

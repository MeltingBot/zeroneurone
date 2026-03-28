import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryStore } from '../../stores/queryStore';
import { useDossierStore } from '../../stores/dossierStore';
import { getAutocompleteSuggestions, type AutocompleteSuggestion } from '../../services/query';
import { AlertCircle } from 'lucide-react';

export function QueryBuilderText() {
  const { t } = useTranslation('panels');
  const currentText = useQueryStore((s) => s.currentText);
  const parseError = useQueryStore((s) => s.parseError);
  const setText = useQueryStore((s) => s.setText);
  const elements = useDossierStore((s) => s.elements);
  const links = useDossierStore((s) => s.links);

  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const updateSuggestions = useCallback((text: string, pos: number) => {
    if (!text.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const elArr = [...elements.values()];
    const lkArr = [...links.values()];
    const s = getAutocompleteSuggestions(text, pos, elArr, lkArr);
    setSuggestions(s);
    setSelectedIdx(0);
    setShowSuggestions(s.length > 0);
  }, [elements, links]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setText(text);

    // Debounced autocomplete
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const pos = e.target.selectionStart ?? text.length;
      updateSuggestions(text, pos);
    }, 150);
  }, [setText, updateSuggestions]);

  const applySuggestion = useCallback((suggestion: AutocompleteSuggestion) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const pos = textarea.selectionStart;
    const text = currentText;

    // Find the start of the current token to replace
    let tokenStart = pos;
    // Walk back to find the start of the partial token
    // Stop at whitespace, parens, and operator characters
    while (tokenStart > 0 && !/[\s(=<>!]/.test(text[tokenStart - 1])) {
      tokenStart--;
    }
    // Special case: if the partial starts with a quote, include it
    if (text[tokenStart] === '"') {
      // Already included
    }

    const before = text.slice(0, tokenStart);
    const after = text.slice(pos);
    const newText = before + suggestion.text + ' ' + after.trimStart();

    setText(newText);
    setShowSuggestions(false);

    // Focus and set cursor position
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        const newPos = before.length + suggestion.text.length + 1;
        textareaRef.current.setSelectionRange(newPos, newPos);
        textareaRef.current.focus();
      }
    });
  }, [currentText, setText]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx((i) => (i - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (showSuggestions && suggestions.length > 0) {
        e.preventDefault();
        applySuggestion(suggestions[selectedIdx]);
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  }, [showSuggestions, suggestions, selectedIdx, applySuggestion]);

  // Close suggestions on blur (with delay for click)
  const handleBlur = useCallback(() => {
    setTimeout(() => setShowSuggestions(false), 200);
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = `${Math.max(60, ta.scrollHeight)}px`;
    }
  }, [currentText]);

  return (
    <div className="relative p-3">
      {/* Query input */}
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={currentText}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder={t('query.placeholder')}
          spellCheck={false}
          className={`w-full px-3 py-2 text-sm font-mono rounded border transition-colors resize-none ${
            parseError
              ? 'border-error/50 focus:border-error'
              : 'border-border-default focus:border-accent'
          } bg-bg-primary text-text-primary outline-none`}
          style={{ minHeight: '60px' }}
        />

        {/* Parse error */}
        {parseError && (
          <div className="flex items-start gap-1.5 mt-1.5 text-error">
            <AlertCircle size={12} className="mt-0.5 shrink-0" />
            <span className="text-xs">{parseError.message}</span>
          </div>
        )}
      </div>

      {/* Autocomplete popup */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute left-3 right-3 z-50 mt-1 border border-border-default rounded bg-bg-primary shadow-md max-h-48 overflow-y-auto">
          {suggestions.map((s, i) => (
            <button
              key={`${s.type}-${s.text}-${i}`}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors ${
                i === selectedIdx
                  ? 'bg-accent/10 text-accent'
                  : 'text-text-primary hover:bg-bg-secondary'
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                applySuggestion(s);
              }}
              onMouseEnter={() => setSelectedIdx(i)}
            >
              <span className={`shrink-0 w-12 text-[10px] font-medium uppercase ${
                s.type === 'field' ? 'text-blue-500' :
                s.type === 'operator' ? 'text-orange-500' :
                s.type === 'value' ? 'text-green-600' :
                s.type === 'tag' ? 'text-purple-500' :
                'text-text-tertiary'
              }`}>
                {s.type}
              </span>
              <span className="font-mono">{s.text}</span>
              {s.description && (
                <span className="ml-auto text-text-tertiary">{s.description}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Syntax help */}
      <div className="mt-3 text-[10px] text-text-tertiary leading-relaxed">
        <p className="font-medium mb-1">{t('query.syntaxHelp')}</p>
        <p className="font-mono">tag = &quot;personne&quot; AND ville = &quot;Paris&quot;</p>
        <p className="font-mono">confidence &gt; 60 AND date &gt;= 2024-01-01</p>
        <p className="font-mono">notes CONTAINS &quot;blanchiment&quot;</p>
        <p className="font-mono">email EXISTS</p>
      </div>
    </div>
  );
}

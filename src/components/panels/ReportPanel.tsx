import { useEffect, useCallback, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Plus, Loader2, Download, Link2, Link2Off, Globe } from 'lucide-react';
import { useInvestigationStore, useReportStore, useHistoryStore } from '../../stores';
import { usePlugins } from '../../plugins/usePlugins';
import { ReportSectionEditor } from '../report/ReportSectionEditor';
import { Input, IconButton } from '../common';
import { exportInteractiveReport } from '../../services/exportInteractiveReportService';

export function ReportPanel() {
  const { t } = useTranslation('panels');
  const { currentInvestigation, elements, links, assets } = useInvestigationStore();
  const {
    currentReport,
    isLoading,
    activeSectionId,
    loadReport,
    createReport,
    updateReportTitle,
    addSection,
    updateSection,
    removeSection,
    reorderSections,
    setActiveSection,
  } = useReportStore();

  // Drag and drop state
  const [draggingSectionId, setDraggingSectionId] = useState<string | null>(null);
  const [dragOverSectionId, setDragOverSectionId] = useState<string | null>(null);
  const dragCounter = useRef(0);

  const reportToolbarPlugins = usePlugins('report:toolbar');

  // Export options
  const [exportWithLinks, setExportWithLinks] = useState(true);

  // Load or create report when investigation changes
  useEffect(() => {
    if (!currentInvestigation) return;

    loadReport(currentInvestigation.id);
  }, [currentInvestigation, loadReport]);

  // Drag and drop handlers
  const handleDragStart = useCallback((sectionId: string) => {
    setDraggingSectionId(sectionId);
  }, []);

  const handleDragEnter = useCallback((sectionId: string) => {
    dragCounter.current++;
    if (sectionId !== draggingSectionId) {
      setDragOverSectionId(sectionId);
    }
  }, [draggingSectionId]);

  const handleDragLeave = useCallback(() => {
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setDragOverSectionId(null);
    }
  }, []);

  const handleDrop = useCallback(
    (targetSectionId: string) => {
      if (!draggingSectionId || !currentReport || draggingSectionId === targetSectionId) {
        setDraggingSectionId(null);
        setDragOverSectionId(null);
        dragCounter.current = 0;
        return;
      }

      // Reorder: move draggingSectionId to the position of targetSectionId
      const currentOrder = currentReport.sections.map((s) => s.id);
      const fromIndex = currentOrder.indexOf(draggingSectionId);
      const toIndex = currentOrder.indexOf(targetSectionId);

      if (fromIndex !== -1 && toIndex !== -1) {
        currentOrder.splice(fromIndex, 1);
        currentOrder.splice(toIndex, 0, draggingSectionId);
        reorderSections(currentOrder);
      }

      setDraggingSectionId(null);
      setDragOverSectionId(null);
      dragCounter.current = 0;
    },
    [draggingSectionId, currentReport, reorderSections]
  );

  const handleDragEnd = useCallback(() => {
    setDraggingSectionId(null);
    setDragOverSectionId(null);
    dragCounter.current = 0;
  }, []);

  // Handle creating report if none exists
  const handleCreateReport = useCallback(async () => {
    if (!currentInvestigation) return;
    await createReport(currentInvestigation.id, t('report.defaultTitle'));
  }, [currentInvestigation, createReport, t]);

  // Handle adding section
  const handleAddSection = useCallback(async () => {
    await addSection(t('report.defaultSectionTitle'));
  }, [addSection, t]);

  // Handle title change
  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateReportTitle(e.target.value);
    },
    [updateReportTitle]
  );

  // Export report as Markdown
  const handleExportMarkdown = useCallback(
    (keepLinks: boolean) => {
      if (!currentReport) return;

      // Build markdown content
      let markdown = `# ${currentReport.title}\n\n`;

      for (const section of currentReport.sections) {
        markdown += `## ${section.title}\n\n`;

        let content = section.content;
        if (!keepLinks) {
          // Replace [[Label|uuid]] with just Label
          content = content.replace(/\[\[([^\]|]+)\|[^\]]+\]\]/g, '$1');
        }

        markdown += content + '\n\n';
      }

      // Create and download file
      const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${currentReport.title || 'report'}.md`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    },
    [currentReport]
  );

  // Export report as interactive HTML
  const handleExportHTML = useCallback(async () => {
    if (!currentReport || !currentInvestigation) return;

    try {
      const blob = await exportInteractiveReport(
        currentInvestigation,
        currentReport,
        elements,
        links,
        assets
      );

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${currentReport.title || 'report'}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export interactive report:', err);
    }
  }, [currentReport, currentInvestigation, elements, links, assets]);

  if (!currentInvestigation) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <p className="text-sm text-text-secondary">{t('report.noInvestigation')}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <Loader2 size={20} className="animate-spin text-text-tertiary" />
      </div>
    );
  }

  // No report yet - show create button
  if (!currentReport) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4 gap-3">
        <FileText size={32} className="text-text-tertiary" />
        <p className="text-sm text-text-secondary text-center">{t('report.noReport')}</p>
        <button
          onClick={handleCreateReport}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-accent rounded hover:bg-accent/90 transition-colors"
        >
          <Plus size={14} />
          {t('report.createReport')}
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Export toolbar */}
      <div className="px-3 py-1.5 border-b border-border-default flex items-center justify-end gap-1.5">
        <span className="text-xs text-text-tertiary mr-auto">{t('report.export')}</span>
        <IconButton
          onClick={() => setExportWithLinks(!exportWithLinks)}
          title={exportWithLinks ? t('report.exportWithLinks') : t('report.exportWithoutLinks')}
          className={exportWithLinks ? 'text-accent' : 'text-text-tertiary'}
        >
          {exportWithLinks ? <Link2 size={14} /> : <Link2Off size={14} />}
        </IconButton>
        <IconButton
          onClick={() => handleExportMarkdown(exportWithLinks)}
          title={t('report.exportMd')}
          className="text-text-secondary hover:text-accent"
        >
          <Download size={14} />
        </IconButton>
        <IconButton
          onClick={handleExportHTML}
          title={t('report.exportHtml')}
          className="text-text-secondary hover:text-accent"
        >
          <Globe size={14} />
        </IconButton>
        {reportToolbarPlugins.map((PluginComponent, i) => (
          <PluginComponent key={`rtp-${i}`} investigationId={currentInvestigation.id} />
        ))}
      </div>

      {/* Report title */}
      <div className="px-3 py-2 border-b border-border-default">
        <Input
          value={currentReport.title}
          onChange={handleTitleChange}
          placeholder={t('report.titlePlaceholder')}
          className="font-medium"
        />
      </div>

      {/* Sections list */}
      <div className="flex-1 overflow-y-auto">
        {currentReport.sections.length === 0 ? (
          <div className="p-4 text-center">
            <p className="text-sm text-text-tertiary mb-3">{t('report.noSections')}</p>
          </div>
        ) : (
          <div className="divide-y divide-border-default">
            {currentReport.sections.map((section) => (
              <ReportSectionEditor
                key={section.id}
                section={section}
                isActive={activeSectionId === section.id}
                onActivate={() => setActiveSection(section.id)}
                onUpdate={(changes) => updateSection(section.id, changes)}
                onDelete={() => {
                  useHistoryStore.getState().pushAction({
                    type: 'delete-section',
                    undo: { snapshot: { ...section } },
                    redo: { snapshot: section.id },
                  });
                  removeSection(section.id);
                }}
                isDragging={draggingSectionId === section.id}
                isDragOver={dragOverSectionId === section.id}
                onDragStart={() => handleDragStart(section.id)}
                onDragEnter={() => handleDragEnter(section.id)}
                onDragLeave={handleDragLeave}
                onDrop={() => handleDrop(section.id)}
                onDragEnd={handleDragEnd}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add section button */}
      <div className="px-3 py-2 border-t border-border-default">
        <button
          onClick={handleAddSection}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm text-text-secondary border border-dashed border-border-default rounded hover:border-accent hover:text-accent transition-colors"
        >
          <Plus size={14} />
          {t('report.addSection')}
        </button>
      </div>
    </div>
  );
}

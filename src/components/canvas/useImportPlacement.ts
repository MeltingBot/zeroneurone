import { useCallback, useState, type MouseEvent as ReactMouseEvent } from 'react';
import type { TFunction } from 'i18next';

import { useDossierStore, useViewStore, useTabStore, toast, type ImportPlacementData } from '../../stores';
import type { Element } from '../../types';
import { importService } from '../../services/importService';
import { snapshotBeforeImport, commitImportToYDoc } from '../../services/importCommit';
import { withImportProgress } from '../../services/importProgress';
import { elementRepository } from '../../db/repositories/elementRepository';
import { db } from '../../db/database';
import { hasHandDrawnRoute, shiftedRoute } from '../../utils/routeFollow';
import { importFormatOf } from '../../plugins/pluginEventBus';
import { sameValue } from '../../utils/jsonMapping';
import type { DossierStore, HistoryStore, SelectionStore, TabStore, UIStore, ViewStore, WrapperRef } from './canvasHookTypes';

export interface ImportPlacementParams {
  reactFlowWrapper: WrapperRef;
  elements: Element[];
  activeTabId: TabStore['activeTabId'];
  addTabMembers: TabStore['addMembers'];
  pasteElements: DossierStore['pasteElements'];
  updateElement: DossierStore['updateElement'];
  addAsset: DossierStore['addAsset'];
  loadDossier: DossierStore['loadDossier'];
  pushAction: HistoryStore['pushAction'];
  selectElements: SelectionStore['selectElements'];
  exitImportPlacementMode: UIStore['exitImportPlacementMode'];
  requestFitView: ViewStore['requestFitView'];
  tPages: TFunction<'pages'>;
}

/** Import placement mode: the click on the canvas that drops the pending import there */
export function useImportPlacement({
  reactFlowWrapper,
  elements,
  activeTabId,
  addTabMembers,
  pasteElements,
  updateElement,
  addAsset,
  loadDossier,
  pushAction,
  selectElements,
  exitImportPlacementMode,
  requestFitView,
  tPages,
}: ImportPlacementParams) {
  const [isImportingPlacement, setIsImportingPlacement] = useState(false);

  /** Imports the pending content with its top-left corner at the click */
  const placeImport = useCallback(async (event: ReactMouseEvent, importPlacementData: ImportPlacementData) => {
    setIsImportingPlacement(true);

    try {
      // Counted for the progress shown in the placement bar
      await withImportProgress(async () => {
        const viewport = useViewStore.getState().viewport;
        if (!reactFlowWrapper.current) return;
        const bounds = reactFlowWrapper.current.getBoundingClientRect();
        const flowPosition = {
          x: (event.clientX - bounds.left - viewport.x) / viewport.zoom,
          y: (event.clientY - bounds.top - viewport.y) / viewport.zoom,
        };

        // Calculate offset: we want the top-left of the bounding box to be at the click position
        const offsetX = flowPosition.x - importPlacementData.boundingBox.minX;
        const offsetY = flowPosition.y - importPlacementData.boundingBox.minY;

        // ── Pre-built elements/links (e.g. JSON mapping import): shift to click + paste ──
        if (importPlacementData.prebuilt) {
          const shifted = importPlacementData.prebuilt.elements.map((el) => ({
            ...el,
            position: { x: el.position.x + offsetX, y: el.position.y + offsetY },
          }));
          const placedLinks = importPlacementData.prebuilt.links;
          pasteElements(shifted, placedLinks);
          const placedIds = shifted.map((e) => e.id);
          // Filed before the import counts as done (undo step, selection, end of placement)
          if (activeTabId) await addTabMembers(activeTabId, placedIds);
          // Events for elements already in the dossier: added to them, and
          // taken back by the same undo as the elements created
          const before: { id: string; changes: Partial<Element> }[] = [];
          const calls: { kind: 'elements'; ids: string[]; changes: Partial<Element> }[] = [];
          let attachedEvents = 0;
          for (const { elementId, events, properties = [], notes = '' } of importPlacementData.prebuilt.attached ?? []) {
            const current = useDossierStore.getState().elements.find((el) => el.id === elementId);
            if (!current) continue;
            const prev: Partial<Element> = {};
            const changes: Partial<Element> = {};
            if (events.length > 0) {
              prev.events = current.events ?? [];
              changes.events = [...prev.events, ...events];
            }
            // Properties and notes it does not hold yet (same key and value: kept once)
            const added = properties.filter((p) => !current.properties.some((x) => x.key === p.key && sameValue(x.value, p.value)));
            if (added.length > 0) {
              prev.properties = current.properties;
              changes.properties = [...current.properties, ...added];
            }
            if (notes && !current.notes.includes(notes)) {
              prev.notes = current.notes;
              changes.notes = current.notes ? `${current.notes}\n\n${notes}` : notes;
            }
            if (Object.keys(changes).length === 0) continue;
            before.push({ id: elementId, changes: prev });
            calls.push({ kind: 'elements', ids: [elementId], changes });
            await updateElement(elementId, changes);
            attachedEvents += events.length;
          }
          pushAction({
            type: 'create-elements',
            undo: before.length > 0 ? { bulkElements: before } : {},
            redo: {
              elements: shifted, links: placedLinks, elementIds: placedIds, linkIds: placedLinks.map((l) => l.id),
              ...(calls.length > 0 ? { bulkCalls: calls } : {}),
            },
          });
          selectElements([...placedIds, ...before.map((b) => b.id)]);
          toast.success(tPages('dossier.importPlacement.success', { count: shifted.length }));
          if (before.length > 0) {
            toast.info(tPages('dossier.importPlacement.attached', { count: before.length, events: attachedEvents }));
          }
          importPlacementData.onComplete?.();
          setIsImportingPlacement(false);
          exitImportPlacementMode();

          // Download + attach media assets (after creation). Network-dependent (CORS):
          // attach what succeeds, report failures. Runs async; doesn't block placement.
          const assetJobs = importPlacementData.prebuilt.assets ?? [];
          if (assetJobs.length > 0) {
            void (async () => {
              let ok = 0, fail = 0;
              for (const job of assetJobs) {
                for (const url of job.urls) {
                  try {
                    const res = await fetch(url);
                    if (!res.ok) { fail++; continue; }
                    const blob = await res.blob();
                    if (blob.size > 50 * 1024 * 1024) { fail++; continue; } // 50 MB hard cap
                    const name = (url.split('/').pop() || 'media').split('?')[0] || 'media';
                    await addAsset(job.elementId, new File([blob], name, { type: blob.type || 'application/octet-stream' }));
                    ok++;
                  } catch { fail++; }
                }
              }
              if (ok > 0 || fail > 0) toast.success(tPages('dossier.importPlacement.mediaResult', { ok, fail }));
            })();
          }
          return;
        }

        if (!importPlacementData.file) { setIsImportingPlacement(false); exitImportPlacementMode(); return; }
        let result: Awaited<ReturnType<typeof importService.importFromZip>>;
        const fileName = importPlacementData.file.name.toLowerCase();
        // Snapshot element IDs before import (for tab assignment after reload)
        const preImportIds = new Set(elements.map(e => e.id));
        const snapshot = await snapshotBeforeImport(importPlacementData.dossierId);

        if (importPlacementData.fileContent != null || fileName.endsWith('.anb')) {
          // ── Non-ZIP format: import then shift new elements ──
          const content = importPlacementData.fileContent ?? '';
          const invId = importPlacementData.dossierId;

          const existingIds = snapshot.elementIds;
          const geojsonOptions = importPlacementData.importOptions?.geojson;

          if (fileName.endsWith('.anb')) {
            // Binary: read from the file, not from fileContent
            const { importANB } = await import('../../services/importANB');
            result = await importANB(await importPlacementData.file.arrayBuffer(), invId);
          } else if (geojsonOptions || fileName.endsWith('.geojson')) {
            result = await importService.importFromGeoJSON(content, invId, geojsonOptions);
          } else if (fileName.endsWith('.osintracker')) {
            result = await importService.importFromOsintracker(content, invId);
          } else if (fileName.endsWith('.csv')) {
            result = await importService.importFromCSV(content, invId, {
              createMissingElements: importPlacementData.importOptions?.createMissingElements ?? true,
            });
          } else if (fileName.endsWith('.gexf')) {
            const { importGEXF } = await import('../../services/importGephi');
            result = await importGEXF(content, invId);
          } else if (fileName.endsWith('.gml')) {
            const { importGML } = await import('../../services/importGML');
            result = await importGML(content, invId);
          } else if (fileName.endsWith('.anx')) {
            const { importANX } = await import('../../services/importANX');
            result = await importANX(content, invId);
          } else if (fileName.endsWith('.graphml') || fileName.endsWith('.xml') || fileName.endsWith('.drawio')) {
            const { isANXFormat } = await import('../../services/importANX');
            const { isDrawioFormat, importDrawio } = await import('../../services/importDrawio');
            if (isDrawioFormat(content)) {
              result = await importDrawio(content, invId);
            } else if (isANXFormat(content)) {
              const { importANX } = await import('../../services/importANX');
              result = await importANX(content, invId);
            } else {
              result = await importService.importFromGraphML(content, invId);
            }
          } else if (fileName.endsWith('.ged') || fileName.endsWith('.gw')) {
            result = await importService.importFromGenealogy(importPlacementData.file, invId);
          } else if (fileName.endsWith('.txt') || fileName.endsWith('.fec')) {
            const { importFEC, isFECFormat } = await import('../../services/importFEC');
            result = isFECFormat(content)
              ? await importFEC(content, invId, importPlacementData.importOptions?.fec)
              : { success: false, elementsImported: 0, linksImported: 0, assetsImported: 0, reportImported: false, errors: ['Unsupported format'], warnings: [] };
          } else if (fileName.endsWith('.json') || fileName.endsWith('.excalidraw')) {
            result = await importService.importFromJSON(content, invId);
          } else {
            try {
              JSON.parse(content);
              result = await importService.importFromJSON(content, invId);
            } catch {
              result = { success: false, elementsImported: 0, linksImported: 0, assetsImported: 0, reportImported: false, errors: ['Unsupported format'], warnings: [] };
            }
          }

          // Shift newly created elements to the click position
          if (result.success && result.elementsImported > 0) {
            const allElements = await elementRepository.getByDossier(invId);
            const newElements = allElements.filter(e => !existingIds.has(e.id));

            if (newElements.length > 0) {
              let minX = Infinity, minY = Infinity;
              for (const el of newElements) {
                if (el.position.x < minX) minX = el.position.x;
                if (el.position.y < minY) minY = el.position.y;
              }

              // Shift so top-left of new elements lands at click position
              const shiftX = flowPosition.x - minX;
              const shiftY = flowPosition.y - minY;

              const positionUpdates = newElements.map(el => ({
                id: el.id,
                position: {
                  x: el.position.x + shiftX,
                  y: el.position.y + shiftY,
                },
              }));

              await elementRepository.updatePositions(positionUpdates);

              // Routes drawn by hand on the imported links move with their elements
              const newLinks = (await db.links.where('dossierId').equals(invId).toArray())
                .filter((l) => !snapshot.linkIds.has(l.id) && hasHandDrawnRoute(l));
              for (const link of newLinks) {
                await db.links.update(link.id, shiftedRoute(link, { x: shiftX, y: shiftY }));
              }
            }
          }
        } else {
          // ── ZIP format: import with built-in offset ──
          result = await importService.importFromZip(
            importPlacementData.file,
            importPlacementData.dossierId,
            { x: offsetX, y: offsetY },
            importPlacementData.importOptions?.zipTabs,
          );
        }

        if (result.success) {
          toast.success(tPages('dossier.importPlacement.success', {
            count: result.elementsImported
          }));

          // The import wrote to Dexie: bring it into the open Y.Doc (kept, with
          // its comments and shared session), then reload assets and report.
          await commitImportToYDoc(snapshot, importFormatOf(importPlacementData.file?.name));
          await loadDossier(importPlacementData.dossierId);

          // Request fitView to show all elements including imported ones
          requestFitView();

          // Chosen archive tabs: into the dossier's tab of the same name, or a
          // new one; what no tab takes goes to the open tab
          const placed = new Set<string>(result.linkedOnlyIds ?? []);
          const createdTabIds: string[] = [];
          for (const plan of result.tabPlan ?? []) {
            if (plan.memberIds.length === 0) continue;
            const { tabs } = useTabStore.getState();
            const key = plan.name.trim().toLowerCase();
            let target = tabs.find((tab) => tab.name.trim().toLowerCase() === key) ?? null;
            if (!target) {
              target = await useTabStore.getState().createTab(importPlacementData.dossierId, plan.name);
              createdTabIds.push(target.id);
            }
            await addTabMembers(target.id, plan.memberIds);
            plan.memberIds.forEach((id) => placed.add(id));
          }

          if (activeTabId) {
            const importedIds = useDossierStore.getState().elements
              .filter(el => !preImportIds.has(el.id) && !placed.has(el.id))
              .map(el => el.id);
            if (importedIds.length > 0) {
              // Filed before the import counts as done (undo step, selection, end of placement)
              await addTabMembers(activeTabId, importedIds);
            }
          }

          // One undoable action: Ctrl+Z removes what the import added (and the
          // tabs it created); the imported elements stay selected
          {
            const after = useDossierStore.getState();
            const newElements = after.elements.filter((el) => !preImportIds.has(el.id));
            const newLinks = after.links.filter((l) => !snapshot.linkIds.has(l.id));
            if (newElements.length > 0) {
              pushAction({
                type: 'create-elements',
                undo: { createdTabIds },
                redo: {
                  elements: newElements,
                  links: newLinks,
                  elementIds: newElements.map((el) => el.id),
                  linkIds: newLinks.map((l) => l.id),
                },
              });
              selectElements(newElements.map((el) => el.id));
            }
          }

          importPlacementData.onComplete?.();
        } else {
          toast.error(result.errors[0] || tPages('dossier.importPlacement.error'));
        }
      });
    } catch {
      toast.error(tPages('dossier.importPlacement.error'));
    } finally {
      setIsImportingPlacement(false);
      exitImportPlacementMode();
    }
  }, [loadDossier, exitImportPlacementMode, tPages, requestFitView, elements, activeTabId, addTabMembers, pasteElements, pushAction, selectElements, addAsset, updateElement, reactFlowWrapper]);

  return { isImportingPlacement, placeImport };
}

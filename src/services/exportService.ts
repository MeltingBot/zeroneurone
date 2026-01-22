import JSZip from 'jszip';
import type { Investigation, Element, Link, Asset } from '../types';
import { fileService } from './fileService';
import { generateUUID, getExtension } from '../utils';

export type ExportFormat = 'json' | 'csv' | 'graphml' | 'zip';

/** Asset metadata for export (without binary data) */
export interface ExportedAssetMeta {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  /** Path within the ZIP archive (uses UUID) */
  archivePath: string;
}

export interface ExportData {
  version: string;
  exportedAt: string;
  investigation: Investigation;
  elements: Element[];
  links: Link[];
  /** Asset metadata (files are stored separately in ZIP) */
  assets?: ExportedAssetMeta[];
}

class ExportService {
  private readonly VERSION = '1.1.0'; // Updated for ZIP assets support

  /**
   * Export investigation data to JSON string
   */
  exportToJSON(
    investigation: Investigation,
    elements: Element[],
    links: Link[],
    assetsMeta?: ExportedAssetMeta[]
  ): string {
    const data: ExportData = {
      version: this.VERSION,
      exportedAt: new Date().toISOString(),
      investigation,
      elements,
      links,
      assets: assetsMeta,
    };
    return JSON.stringify(data, null, 2);
  }

  /**
   * Export investigation as ZIP archive with assets
   */
  async exportToZip(
    investigation: Investigation,
    elements: Element[],
    links: Link[],
    assets: Asset[]
  ): Promise<Blob> {
    const zip = new JSZip();

    // Prepare asset metadata and add files to ZIP
    const assetsMeta: ExportedAssetMeta[] = [];

    for (const asset of assets) {
      try {
        const file = await fileService.getAssetFile(asset);
        const arrayBuffer = await file.arrayBuffer();

        // Create archive path: assets/{uuid}.{ext}
        const ext = getExtension(asset.filename);
        const archivePath = `assets/${generateUUID()}.${ext}`;

        // Add file to ZIP
        zip.file(archivePath, arrayBuffer);

        // Store metadata
        assetsMeta.push({
          id: asset.id,
          filename: asset.filename,
          mimeType: asset.mimeType,
          size: asset.size,
          archivePath,
        });
      } catch (error) {
        console.warn(`Failed to export asset ${asset.filename}:`, error);
      }
    }

    // Add JSON metadata
    const jsonContent = this.exportToJSON(investigation, elements, links, assetsMeta);
    zip.file('investigation.json', jsonContent);

    // Generate ZIP blob
    return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  }

  /**
   * Export elements and links to unified CSV format with type column
   */
  exportToCSV(elements: Element[], links: Link[]): string {
    // Build a map of element IDs to labels for resolving links
    const elementLabels = new Map<string, string>();
    elements.forEach((el) => elementLabels.set(el.id, el.label));

    // Collect all unique property keys from elements and links
    const propertyKeys = new Set<string>();
    elements.forEach((el) => el.properties?.forEach((p) => propertyKeys.add(p.key)));
    links.forEach((link) => link.properties?.forEach((p) => propertyKeys.add(p.key)));
    const sortedPropertyKeys = Array.from(propertyKeys).sort((a, b) => a.localeCompare(b, 'fr'));

    const baseHeaders = [
      'type',
      'label',
      'de',
      'vers',
      'notes',
      'tags',
      'confiance',
      'source',
      'date',
      'date_debut',
      'date_fin',
      'latitude',
      'longitude',
      'dirige',
      'couleur',
      'forme',
      'style',
    ];
    const headers = [...baseHeaders, ...sortedPropertyKeys];

    const rows: string[][] = [];

    // Add elements
    for (const el of elements) {
      const baseRow = [
        'element',
        this.escapeCSV(el.label),
        '', // de
        '', // vers
        this.escapeCSV(el.notes),
        this.escapeCSV(el.tags.join(';')),
        el.confidence?.toString() ?? '',
        this.escapeCSV(el.source),
        el.date ? new Date(el.date).toISOString().slice(0, 10) : '',
        '', // date_debut
        '', // date_fin
        el.geo?.lat?.toString() ?? '',
        el.geo?.lng?.toString() ?? '',
        '', // dirige
        el.visual.color,
        el.visual.shape,
        '', // style
      ];
      // Add property values
      const propsMap = new Map(el.properties?.map((p) => [p.key, String(p.value)]) ?? []);
      for (const key of sortedPropertyKeys) {
        baseRow.push(this.escapeCSV(propsMap.get(key) ?? ''));
      }
      rows.push(baseRow);
    }

    // Add links
    for (const link of links) {
      const baseRow = [
        'lien',
        this.escapeCSV(link.label),
        this.escapeCSV(elementLabels.get(link.fromId) || link.fromId),
        this.escapeCSV(elementLabels.get(link.toId) || link.toId),
        this.escapeCSV(link.notes),
        '', // tags
        link.confidence?.toString() ?? '',
        this.escapeCSV(link.source),
        '', // date
        link.dateRange?.start ? new Date(link.dateRange.start).toISOString().slice(0, 10) : '',
        link.dateRange?.end ? new Date(link.dateRange.end).toISOString().slice(0, 10) : '',
        '', // latitude
        '', // longitude
        link.directed ? 'oui' : 'non',
        link.visual.color,
        '', // forme
        link.visual.style,
      ];
      // Add property values
      const propsMap = new Map(link.properties?.map((p) => [p.key, String(p.value)]) ?? []);
      for (const key of sortedPropertyKeys) {
        baseRow.push(this.escapeCSV(propsMap.get(key) ?? ''));
      }
      rows.push(baseRow);
    }

    return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
  }

  /**
   * Generate unified CSV template with examples
   * Includes custom property columns to show how they work
   */
  generateCSVTemplate(): string {
    // Base headers + example custom properties
    const headers = ['type', 'label', 'de', 'vers', 'notes', 'tags', 'confiance', 'source', 'date', 'date_debut', 'date_fin', 'latitude', 'longitude', 'dirige', 'couleur', 'forme', 'style', 'prenom', 'nom', 'telephone'];
    const examples = [
      ['element', 'Jean Dupont', '', '', 'Suspect principal', 'personne;suspect', '80', 'Enquete', '2024-01-15', '', '', '48.8566', '2.3522', '', '#fef3c7', 'circle', '', 'Jean', 'Dupont', '06 11 22 33 44'],
      ['element', 'Marie Martin', '', '', 'Temoin', 'personne;temoin', '60', '', '', '', '', '', '', '', '#dbeafe', 'circle', '', 'Marie', 'Martin', ''],
      ['element', '06 12 34 56 78', '', '', 'Telephone prepaye', 'telephone', '', '', '', '', '', '', '', '', '#dcfce7', 'square', '', '', '', ''],
      ['lien', 'Appel', 'Jean Dupont', 'Marie Martin', 'Duree 5 min', '', '90', '', '', '2024-01-15', '2024-01-15', '', '', 'oui', '#d4cec4', '', 'solid', '', '', ''],
      ['lien', 'Proprietaire', 'Jean Dupont', '06 12 34 56 78', '', '', '100', '', '', '', '', '', '', 'oui', '#d4cec4', '', 'solid', '', '', ''],
    ];
    return [headers.join(','), ...examples.map((row) => row.join(','))].join('\n');
  }

  /**
   * Export to GraphML format for use in other graph tools
   */
  exportToGraphML(
    investigation: Investigation,
    elements: Element[],
    links: Link[]
  ): string {
    const xmlHeader = '<?xml version="1.0" encoding="UTF-8"?>';
    const graphmlOpen = `<graphml xmlns="http://graphml.graphdrawing.org/xmlns">`;

    // Define keys for node/edge attributes
    const keys = `
  <key id="label" for="node" attr.name="label" attr.type="string"/>
  <key id="color" for="node" attr.name="color" attr.type="string"/>
  <key id="notes" for="node" attr.name="notes" attr.type="string"/>
  <key id="edgeLabel" for="edge" attr.name="label" attr.type="string"/>
  <key id="edgeColor" for="edge" attr.name="color" attr.type="string"/>`;

    const graphOpen = `  <graph id="${investigation.id}" edgedefault="undirected">`;

    // Nodes
    const nodes = elements.map((el) => `
    <node id="${el.id}">
      <data key="label">${this.escapeXML(el.label)}</data>
      <data key="color">${el.visual.color}</data>
      <data key="notes">${this.escapeXML(el.notes)}</data>
    </node>`).join('');

    // Edges
    const edges = links.map((link) => `
    <edge id="${link.id}" source="${link.fromId}" target="${link.toId}">
      <data key="edgeLabel">${this.escapeXML(link.label)}</data>
      <data key="edgeColor">${link.visual.color}</data>
    </edge>`).join('');

    const graphClose = `
  </graph>`;
    const graphmlClose = `</graphml>`;

    return [xmlHeader, graphmlOpen, keys, graphOpen, nodes, edges, graphClose, graphmlClose].join('\n');
  }

  /**
   * Download string data as a file
   */
  download(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    this.downloadBlob(blob, filename);
  }

  /**
   * Download blob as a file
   */
  downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Export and download investigation in specified format
   * @param assets - For ZIP format, the raw assets to include
   */
  async exportInvestigation(
    format: ExportFormat,
    investigation: Investigation,
    elements: Element[],
    links: Link[],
    assets?: Asset[]
  ): Promise<void> {
    const now = new Date();
    const timestamp = `${now.toISOString().slice(0, 10)}_${now.toTimeString().slice(0, 8).replace(/:/g, '-')}`;
    const baseName = `${investigation.name.replace(/[^a-z0-9]/gi, '_')}_${timestamp}`;

    switch (format) {
      case 'zip': {
        const zipBlob = await this.exportToZip(investigation, elements, links, assets || []);
        this.downloadBlob(zipBlob, `${baseName}.zip`);
        break;
      }
      case 'json': {
        const json = this.exportToJSON(investigation, elements, links);
        this.download(json, `${baseName}.json`, 'application/json');
        break;
      }
      case 'csv': {
        // Export unified CSV with elements and links
        const csv = this.exportToCSV(elements, links);
        this.download(csv, `${baseName}.csv`, 'text/csv');
        break;
      }
      case 'graphml': {
        const graphml = this.exportToGraphML(investigation, elements, links);
        this.download(graphml, `${baseName}.graphml`, 'application/xml');
        break;
      }
    }
  }

  private escapeCSV(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  private escapeXML(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}

export const exportService = new ExportService();

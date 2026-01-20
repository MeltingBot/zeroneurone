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
   * Export elements to CSV format (French columns for user-friendliness)
   */
  exportElementsToCSV(elements: Element[]): string {
    const headers = [
      'label',
      'notes',
      'tags',
      'confiance',
      'source',
      'date',
      'latitude',
      'longitude',
      'couleur',
      'forme',
    ];

    const rows = elements.map((el) => [
      this.escapeCSV(el.label),
      this.escapeCSV(el.notes),
      this.escapeCSV(el.tags.join(';')),
      el.confidence ?? '',
      this.escapeCSV(el.source),
      el.date ? new Date(el.date).toISOString().slice(0, 10) : '',
      el.geo?.lat ?? '',
      el.geo?.lng ?? '',
      el.visual.color,
      el.visual.shape,
    ]);

    return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
  }

  /**
   * Export links to CSV format (French columns, uses element labels instead of IDs)
   */
  exportLinksToCSV(links: Link[], elements: Element[]): string {
    // Build a map of element IDs to labels for resolving links
    const elementLabels = new Map<string, string>();
    elements.forEach((el) => elementLabels.set(el.id, el.label));

    const headers = [
      'de',
      'vers',
      'label',
      'notes',
      'confiance',
      'source',
      'date_debut',
      'date_fin',
      'dirige',
      'couleur',
      'style',
    ];

    const rows = links.map((link) => [
      this.escapeCSV(elementLabels.get(link.fromId) || link.fromId),
      this.escapeCSV(elementLabels.get(link.toId) || link.toId),
      this.escapeCSV(link.label),
      this.escapeCSV(link.notes),
      link.confidence ?? '',
      this.escapeCSV(link.source),
      link.dateRange?.start ? new Date(link.dateRange.start).toISOString().slice(0, 10) : '',
      link.dateRange?.end ? new Date(link.dateRange.end).toISOString().slice(0, 10) : '',
      link.directed ? 'oui' : 'non',
      link.visual.color,
      link.visual.style,
    ]);

    return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
  }

  /**
   * Generate CSV template for elements with example
   */
  generateElementsTemplate(): string {
    const headers = ['label', 'notes', 'tags', 'confiance', 'source', 'date', 'latitude', 'longitude', 'couleur', 'forme'];
    const example = ['Jean Dupont', 'Suspect principal', 'suspect;priorite', '80', 'Enquete terrain', '2024-01-15', '48.8566', '2.3522', '#fef3c7', 'circle'];
    return [headers.join(','), example.join(',')].join('\n');
  }

  /**
   * Generate CSV template for links with example
   */
  generateLinksTemplate(): string {
    const headers = ['de', 'vers', 'label', 'notes', 'confiance', 'date_debut', 'date_fin', 'dirige', 'couleur', 'style'];
    const example = ['Jean Dupont', 'Marie Martin', 'Appel telephonique', 'Duree 5 min', '90', '2024-01-15', '2024-01-15', 'oui', '#d4cec4', 'solid'];
    return [headers.join(','), example.join(',')].join('\n');
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
        // Export elements CSV
        const elementsCSV = this.exportElementsToCSV(elements);
        this.download(elementsCSV, `${baseName}_elements.csv`, 'text/csv');
        // Export links CSV (needs elements to resolve labels)
        const linksCSV = this.exportLinksToCSV(links, elements);
        this.download(linksCSV, `${baseName}_liens.csv`, 'text/csv');
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

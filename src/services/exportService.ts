import JSZip from 'jszip';
import type { Investigation, Element, Link, Asset, Report, CanvasTab } from '../types';
import { fileService } from './fileService';
import { generateUUID, getExtension } from '../utils';

export type ExportFormat = 'json' | 'csv' | 'graphml' | 'geojson' | 'zip';

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
  /** Report with sections */
  report?: Report | null;
  /** Canvas tabs (shared investigation structure) */
  tabs?: CanvasTab[];
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
    assetsMeta?: ExportedAssetMeta[],
    report?: Report | null,
    tabs?: CanvasTab[]
  ): string {
    // Strip local-only viewport from tabs before export
    const exportTabs = tabs?.map(({ viewport: _v, ...rest }) => rest);
    const data: ExportData = {
      version: this.VERSION,
      exportedAt: new Date().toISOString(),
      investigation,
      elements,
      links,
      assets: assetsMeta,
      report: report || null,
      tabs: exportTabs && exportTabs.length > 0 ? exportTabs as CanvasTab[] : undefined,
    };
    return JSON.stringify(data, null, 2);
  }

  /**
   * Export investigation as ZIP archive with assets and optional report
   */
  async exportToZip(
    investigation: Investigation,
    elements: Element[],
    links: Link[],
    assets: Asset[],
    report?: Report | null,
    tabs?: CanvasTab[]
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

    // Add JSON metadata (includes report data for import)
    const jsonContent = this.exportToJSON(investigation, elements, links, assetsMeta, report, tabs);
    zip.file('investigation.json', jsonContent);

    // Add report Markdown if present (human-readable version)
    if (report && report.sections.length > 0) {
      const reportMarkdown = this.reportToMarkdown(report, elements, links);
      zip.file('report.md', reportMarkdown);
    }

    // Generate ZIP blob
    return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  }

  /**
   * Convert a Report to Markdown format
   */
  private reportToMarkdown(report: Report, elements: Element[], links: Link[]): string {
    // Build lookup for resolving [[Label|id]] references (includes both elements and links)
    const referenceMap = new Map<string, { exists: true }>();
    elements.forEach(el => referenceMap.set(el.id, { exists: true }));
    links.forEach(link => referenceMap.set(link.id, { exists: true }));

    let md = `# ${report.title || 'Rapport'}\n\n`;

    // Sort sections by order
    const sortedSections = [...report.sections].sort((a, b) => a.order - b.order);

    for (const section of sortedSections) {
      if (section.title) {
        md += `## ${section.title}\n\n`;
      }

      // Process content: resolve [[Label|id]] references
      let content = section.content || '';
      content = content.replace(/\[\[([^\]|]+)\|([a-f0-9-]+)\]\]/g, (_match, label, id) => {
        if (referenceMap.has(id)) {
          return `**${label}**`;
        }
        // Element/link was deleted - show strikethrough
        return `~~${label}~~`;
      });

      md += content;
      if (!content.endsWith('\n')) {
        md += '\n';
      }
      md += '\n';
    }

    return md;
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
      'position_x',
      'position_y',
      'dirige',
      'couleur',
      'forme',
      'style',
      'est_groupe',
      'groupe_parent',
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
        el.position?.x?.toString() ?? '',
        el.position?.y?.toString() ?? '',
        '', // dirige
        el.visual.color,
        el.visual.shape,
        '', // style
        el.isGroup ? 'oui' : 'non',
        el.parentGroupId ?? '',
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
        '', // position_x
        '', // position_y
        link.directed ? 'oui' : 'non',
        link.visual.color,
        '', // forme
        link.visual.style,
        '', // est_groupe
        '', // groupe_parent
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
    const headers = ['type', 'label', 'de', 'vers', 'notes', 'tags', 'confiance', 'source', 'date', 'date_debut', 'date_fin', 'latitude', 'longitude', 'position_x', 'position_y', 'dirige', 'couleur', 'forme', 'style', 'est_groupe', 'groupe_parent', 'prenom', 'nom', 'telephone'];
    const examples = [
      ['element', 'Jean Dupont', '', '', 'Suspect principal', 'personne;suspect', '80', 'Enquete', '2024-01-15', '', '', '48.8566', '2.3522', '100', '200', '', '#fef3c7', 'circle', '', 'non', '', 'Jean', 'Dupont', '06 11 22 33 44'],
      ['element', 'Marie Martin', '', '', 'Temoin', 'personne;temoin', '60', '', '', '', '', '', '', '300', '200', '', '#dbeafe', 'circle', '', 'non', '', 'Marie', 'Martin', ''],
      ['element', '06 12 34 56 78', '', '', 'Telephone prepaye', 'telephone', '', '', '', '', '', '', '', '200', '400', '', '#dcfce7', 'square', '', 'non', '', '', '', ''],
      ['lien', 'Appel', 'Jean Dupont', 'Marie Martin', 'Duree 5 min', '', '90', '', '', '2024-01-15', '2024-01-15', '', '', '', '', 'oui', '#d4cec4', '', 'solid', '', '', '', '', ''],
      ['lien', 'Proprietaire', 'Jean Dupont', '06 12 34 56 78', '', '', '100', '', '', '', '', '', '', '', '', 'oui', '#d4cec4', '', 'solid', '', '', '', '', ''],
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
   * Export to GeoJSON format for GIS tools
   * Only includes elements with valid geo coordinates
   * Links are exported as LineStrings if both endpoints have geo
   */
  exportToGeoJSON(
    investigation: Investigation,
    elements: Element[],
    links: Link[]
  ): string {
    // Build element map for link endpoint lookup
    const elementMap = new Map(elements.map(el => [el.id, el]));

    // Filter elements with valid geo coordinates
    const geoElements = elements.filter(
      el => el.geo && (el.geo.lat !== 0 || el.geo.lng !== 0)
    );

    // Build features from elements
    const elementFeatures = geoElements.map(el => ({
      type: 'Feature' as const,
      id: el.id,
      geometry: {
        type: 'Point' as const,
        coordinates: [el.geo!.lng, el.geo!.lat], // GeoJSON uses [lng, lat]
      },
      properties: {
        name: el.label,
        type: 'element',
        notes: el.notes || null,
        tags: el.tags.length > 0 ? el.tags : null,
        confidence: el.confidence,
        source: el.source || null,
        date: el.date ? new Date(el.date).toISOString() : null,
        color: el.visual.color,
        shape: el.visual.shape,
        // Include custom properties
        ...Object.fromEntries(
          el.properties?.map(p => [`prop_${p.key}`, p.value]) ?? []
        ),
      },
    }));

    // Build features from links (as LineStrings if both endpoints have geo)
    const linkFeatures = links
      .map(link => {
        const fromEl = elementMap.get(link.fromId);
        const toEl = elementMap.get(link.toId);

        // Skip if either endpoint doesn't have geo
        if (!fromEl?.geo || !toEl?.geo) return null;
        if (fromEl.geo.lat === 0 && fromEl.geo.lng === 0) return null;
        if (toEl.geo.lat === 0 && toEl.geo.lng === 0) return null;

        return {
          type: 'Feature' as const,
          id: link.id,
          geometry: {
            type: 'LineString' as const,
            coordinates: [
              [fromEl.geo.lng, fromEl.geo.lat],
              [toEl.geo.lng, toEl.geo.lat],
            ],
          },
          properties: {
            name: link.label || `${fromEl.label} → ${toEl.label}`,
            type: 'link',
            from: fromEl.label,
            to: toEl.label,
            fromId: link.fromId,
            toId: link.toId,
            notes: link.notes || null,
            tags: link.tags?.length > 0 ? link.tags : null,
            confidence: link.confidence,
            source: link.source || null,
            directed: link.directed,
            dateStart: link.dateRange?.start ? new Date(link.dateRange.start).toISOString() : null,
            dateEnd: link.dateRange?.end ? new Date(link.dateRange.end).toISOString() : null,
            color: link.visual.color,
            style: link.visual.style,
            // Include custom properties
            ...Object.fromEntries(
              link.properties?.map(p => [`prop_${p.key}`, p.value]) ?? []
            ),
          },
        };
      })
      .filter((f): f is NonNullable<typeof f> => f !== null);

    const geojson = {
      type: 'FeatureCollection' as const,
      name: investigation.name,
      metadata: {
        exportedAt: new Date().toISOString(),
        source: 'zeroneurone',
        version: this.VERSION,
        investigation: {
          id: investigation.id,
          name: investigation.name,
          description: investigation.description,
        },
        stats: {
          totalElements: elements.length,
          elementsWithGeo: geoElements.length,
          totalLinks: links.length,
          linksWithGeo: linkFeatures.length,
        },
      },
      features: [...elementFeatures, ...linkFeatures],
    };

    return JSON.stringify(geojson, null, 2);
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
   * @param report - For ZIP format, the optional report to include
   */
  async exportInvestigation(
    format: ExportFormat,
    investigation: Investigation,
    elements: Element[],
    links: Link[],
    assets?: Asset[],
    report?: Report | null,
    tabs?: CanvasTab[]
  ): Promise<void> {
    const now = new Date();
    const timestamp = `${now.toISOString().slice(0, 10)}_${now.toTimeString().slice(0, 8).replace(/:/g, '-')}`;
    const baseName = `${investigation.name.replace(/[^a-z0-9]/gi, '_')}_${timestamp}`;

    switch (format) {
      case 'zip': {
        const zipBlob = await this.exportToZip(investigation, elements, links, assets || [], report, tabs);
        this.downloadBlob(zipBlob, `${baseName}.zip`);
        break;
      }
      case 'json': {
        const json = this.exportToJSON(investigation, elements, links, undefined, undefined, tabs);
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
      case 'geojson': {
        const geojson = this.exportToGeoJSON(investigation, elements, links);
        this.download(geojson, `${baseName}.geojson`, 'application/geo+json');
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

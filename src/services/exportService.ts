import JSZip from 'jszip';
import type { Dossier, Element, Link, Asset, Report, CanvasTab, View, SavedQuery, Comment } from '../types';
import { getPlugins } from '../plugins/pluginRegistry';
import { fileService } from './fileService';
import { generateUUID, getExtension } from '../utils';
import { isGeoPolygon, getGeoCenter } from '../utils/geo';
import { encryptZip } from './encryption/zipEncryption';

export type ExportFormat = 'json' | 'csv' | 'graphml' | 'gexf' | 'geojson' | 'zip';

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
  dossier: Dossier;
  elements: Element[];
  links: Link[];
  /** Asset metadata (files are stored separately in ZIP) */
  assets?: ExportedAssetMeta[];
  /** Report with sections */
  report?: Report | null;
  /** Canvas tabs (shared dossier structure) */
  tabs?: CanvasTab[];
  /** Saved views (filters, hidden elements, saved layout) */
  views?: View[];
  /** Saved ZNQuery queries (per dossier) */
  queries?: SavedQuery[];
  /** Recent ZNQuery history (query text strings, session-level) */
  queryHistory?: string[];
  /** Comments on elements/links */
  comments?: Comment[];
}

class ExportService {
  private readonly VERSION = '1.1.0'; // Updated for ZIP assets support

  /**
   * Export dossier data to JSON string
   */
  exportToJSON(
    dossier: Dossier,
    elements: Element[],
    links: Link[],
    assetsMeta?: ExportedAssetMeta[],
    report?: Report | null,
    tabs?: CanvasTab[],
    views?: View[],
    queries?: SavedQuery[],
    queryHistory?: string[],
    comments?: Comment[]
  ): string {
    // Strip local-only viewport from tabs before export
    const exportTabs = tabs?.map(({ viewport: _v, ...rest }) => rest);
    const data: ExportData = {
      version: this.VERSION,
      exportedAt: new Date().toISOString(),
      dossier,
      elements,
      links,
      assets: assetsMeta,
      report: report || null,
      tabs: exportTabs && exportTabs.length > 0 ? exportTabs as CanvasTab[] : undefined,
      views: views && views.length > 0 ? views : undefined,
      queries: queries && queries.length > 0 ? queries : undefined,
      queryHistory: queryHistory && queryHistory.length > 0 ? queryHistory : undefined,
      comments: comments && comments.length > 0 ? comments : undefined,
    };
    return JSON.stringify(data, null, 2);
  }

  /**
   * Export dossier as ZIP archive with assets and optional report
   */
  async exportToZip(
    dossier: Dossier,
    elements: Element[],
    links: Link[],
    assets: Asset[],
    report?: Report | null,
    tabs?: CanvasTab[],
    views?: View[],
    queries?: SavedQuery[],
    queryHistory?: string[],
    comments?: Comment[]
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
    const jsonContent = this.exportToJSON(dossier, elements, links, assetsMeta, report, tabs, views, queries, queryHistory, comments);
    zip.file('dossier.json', jsonContent);

    // Add report Markdown if present (human-readable version)
    if (report && report.sections.length > 0) {
      const reportMarkdown = this.reportToMarkdown(report, elements, links);
      zip.file('report.md', reportMarkdown);
    }

    // Plugin export hooks
    const exportHooks = getPlugins('export:hooks');
    for (const hook of exportHooks) {
      try {
        await hook.onExport(zip, dossier.id);
      } catch (e) {
        console.warn(`Plugin export hook "${hook.name}" failed:`, e);
      }
    }

    // Generate ZIP blob
    return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  }

  /**
   * Export dossier as encrypted ZIP (.znzip) with a user password.
   * Generates a standard ZIP then encrypts the whole blob with PBKDF2+AES-256-GCM.
   */
  async exportToEncryptedZip(
    password: string,
    dossier: Dossier,
    elements: Element[],
    links: Link[],
    assets: Asset[],
    report?: Report | null,
    tabs?: CanvasTab[],
    views?: View[],
    queries?: SavedQuery[],
    queryHistory?: string[],
    comments?: Comment[]
  ): Promise<Blob> {
    const zipBlob = await this.exportToZip(dossier, elements, links, assets, report, tabs, views, queries, queryHistory, comments);
    const encBuf = await encryptZip(zipBlob, password);
    return new Blob([encBuf], { type: 'application/octet-stream' });
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

    // Collect all unique property keys from elements, links and element events
    const propertyKeys = new Set<string>();
    elements.forEach((el) => el.properties?.forEach((p) => propertyKeys.add(p.key)));
    links.forEach((link) => link.properties?.forEach((p) => propertyKeys.add(p.key)));
    elements.forEach((el) => el.events?.forEach((ev) => ev.properties?.forEach((p) => propertyKeys.add(p.key))));
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
        el.geo ? getGeoCenter(el.geo).lat.toString() : '',
        el.geo ? getGeoCenter(el.geo).lng.toString() : '',
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

    // Add events (one row per event, attached to its parent element via "de")
    for (const el of elements) {
      for (const ev of el.events ?? []) {
        const baseRow = [
          'event',
          this.escapeCSV(ev.label),
          this.escapeCSV(el.label), // de = parent element
          '', // vers
          this.escapeCSV(ev.description ?? ''),
          '', // tags
          '', // confiance
          this.escapeCSV(ev.source ?? ''),
          ev.date ? new Date(ev.date).toISOString().slice(0, 10) : '',
          '', // date_debut
          ev.dateEnd ? new Date(ev.dateEnd).toISOString().slice(0, 10) : '',
          ev.geo ? getGeoCenter(ev.geo).lat.toString() : '',
          ev.geo ? getGeoCenter(ev.geo).lng.toString() : '',
          '', // position_x
          '', // position_y
          '', // dirige
          '', // couleur
          '', // forme
          '', // style
          '', // est_groupe
          '', // groupe_parent
        ];
        // Add property values
        const propsMap = new Map(ev.properties?.map((p) => [p.key, String(p.value)]) ?? []);
        for (const key of sortedPropertyKeys) {
          baseRow.push(this.escapeCSV(propsMap.get(key) ?? ''));
        }
        rows.push(baseRow);
      }
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
      ['element', 'Jean Dupont', '', '', 'Suspect principal ; alias "Le Chat"', 'personne;suspect', '80', 'Enquete', '2024-01-15', '', '', '48.8566', '2.3522', '100', '200', '', '#fef3c7', 'circle', '', 'non', '', 'Jean', 'Dupont', '06 11 22 33 44'],
      ['element', 'Marie Martin', '', '', 'Temoin', 'personne;temoin', '60', '', '', '', '', '', '', '300', '200', '', '#dbeafe', 'circle', '', 'non', '', 'Marie', 'Martin', ''],
      ['element', '06 12 34 56 78', '', '', 'Telephone prepaye', 'telephone', '', '', '', '', '', '', '', '200', '400', '', '#dcfce7', 'square', '', 'non', '', '', '', ''],
      ['lien', 'Appel', 'Jean Dupont', 'Marie Martin', 'Duree 5 min', '', '90', '', '', '2024-01-15', '2024-01-15', '', '', '', '', 'oui', '#d4cec4', '', 'solid', '', '', '', '', ''],
      ['lien', 'Proprietaire', 'Jean Dupont', '06 12 34 56 78', '', '', '100', '', '', '', '', '', '', '', '', 'oui', '#d4cec4', '', 'solid', '', '', '', '', ''],
      ['event', 'Escale Marseille', 'Jean Dupont', '', 'Vu au port', '', '', 'Filature', '2024-01-20', '', '2024-01-21', '43.2965', '5.3698', '', '', '', '', '', '', '', '', '', '', ''],
      ['event', 'Changement de vehicule', 'Jean Dupont', '', '', '', '', 'Enquete', '2024-02-03', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ];
    // Excel-style CSV : delimiter ';', tous les champs entre guillemets (avec "" pour échapper), lignes terminées en CRLF
    const quote = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const formatRow = (row: string[]) => row.map(quote).join(';');
    return [formatRow(headers), ...examples.map(formatRow)].join('\r\n') + '\r\n';
  }

  /**
   * Export to GraphML format for use in other graph tools
   */
  exportToGraphML(
    dossier: Dossier,
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

    const graphOpen = `  <graph id="${dossier.id}" edgedefault="undirected">`;

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
   * Export to GEXF 1.3 format (Gephi native), including visual attributes
   * (position, color, size) via the viz namespace so the graph opens in Gephi
   * with the same layout and colors as on the canvas.
   */
  exportToGEXF(
    dossier: Dossier,
    elements: Element[],
    links: Link[]
  ): string {
    const xmlHeader = '<?xml version="1.0" encoding="UTF-8"?>';
    const gexfOpen =
      '<gexf xmlns="http://gexf.net/1.3" xmlns:viz="http://gexf.net/1.3/viz" version="1.3">';

    const meta = `  <meta>
    <creator>ZeroNeurone</creator>
    <description>${this.escapeXML(dossier.name ?? '')}</description>
  </meta>`;

    const graphOpen = `  <graph defaultedgetype="directed" mode="static">`;

    const nodeAttrs = `    <attributes class="node">
      <attribute id="notes" title="notes" type="string"/>
      <attribute id="tags" title="tags" type="string"/>
    </attributes>`;
    const edgeAttrs = `    <attributes class="edge">
      <attribute id="confidence" title="confidence" type="integer"/>
    </attributes>`;

    const nodes = elements
      .map((el) => {
        const rgb = this.hexToRgb(el.visual?.color);
        const size = this.sizeToNumber(el.visual?.size, el.visual?.customWidth);
        const tags = Array.isArray(el.tags) ? el.tags.join(', ') : '';
        return `      <node id="${el.id}" label="${this.escapeXML(el.label)}">
        <attvalues>
          <attvalue for="notes" value="${this.escapeXML(el.notes ?? '')}"/>
          <attvalue for="tags" value="${this.escapeXML(tags)}"/>
        </attvalues>
        <viz:color r="${rgb.r}" g="${rgb.g}" b="${rgb.b}"/>
        <viz:position x="${el.position.x}" y="${-el.position.y}" z="0"/>
        <viz:size value="${size}"/>
      </node>`;
      })
      .join('\n');

    const edges = links
      .map((link) => {
        // Map ZN direction to GEXF edge type; 'backward' swaps endpoints.
        const dir = link.direction ?? (link.directed ? 'forward' : 'none');
        let source = link.fromId;
        let target = link.toId;
        let type = 'directed';
        if (dir === 'none') type = 'undirected';
        else if (dir === 'both') type = 'mutual';
        else if (dir === 'backward') {
          source = link.toId;
          target = link.fromId;
        }
        const label = link.label ? ` label="${this.escapeXML(link.label)}"` : '';
        const confidence =
          typeof link.confidence === 'number'
            ? `
        <attvalues><attvalue for="confidence" value="${Math.round(link.confidence)}"/></attvalues>`
            : '';
        return `      <edge id="${link.id}" source="${source}" target="${target}" type="${type}"${label}>${confidence}
      </edge>`;
      })
      .join('\n');

    const body = `${graphOpen}
${nodeAttrs}
${edgeAttrs}
    <nodes>
${nodes}
    </nodes>
    <edges>
${edges}
    </edges>
  </graph>`;

    return [xmlHeader, gexfOpen, meta, body, '</gexf>'].join('\n');
  }

  /** Convert a hex color (#RGB or #RRGGBB) to 0-255 RGB, fallback to grey. */
  private hexToRgb(hex: string | null | undefined): { r: number; g: number; b: number } {
    const fallback = { r: 153, g: 153, b: 153 };
    if (!hex || typeof hex !== 'string') return fallback;
    let h = hex.trim().replace(/^#/, '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return fallback;
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }

  /** Map an ElementSize (preset or number) to a numeric GEXF viz:size. */
  private sizeToNumber(size: unknown, customWidth?: number): number {
    if (typeof customWidth === 'number' && customWidth > 0) return customWidth / 4;
    if (typeof size === 'number' && size > 0) return size;
    if (size === 'small') return 10;
    if (size === 'large') return 30;
    return 20; // medium / default
  }

  /**
   * Export to GeoJSON format for GIS tools
   * Only includes elements with valid geo coordinates
   * Links are exported as LineStrings if both endpoints have geo
   */
  exportToGeoJSON(
    dossier: Dossier,
    elements: Element[],
    links: Link[]
  ): string {
    // Build element map for link endpoint lookup
    const elementMap = new Map(elements.map(el => [el.id, el]));

    // Filter elements with valid geo coordinates
    const geoElements = elements.filter(el => {
      if (!el.geo) return false;
      const c = getGeoCenter(el.geo);
      return c.lat !== 0 || c.lng !== 0;
    });

    // Build features from elements
    const elementFeatures = geoElements.map(el => {
      const geo = el.geo!;
      let geometry: GeoJSON.Geometry;
      if (isGeoPolygon(geo)) {
        geometry = {
          type: 'Polygon',
          coordinates: [[...geo.coordinates, geo.coordinates[0]]],
        };
      } else {
        const c = getGeoCenter(geo);
        geometry = {
          type: 'Point',
          coordinates: [c.lng, c.lat],
        };
      }
      return {
        type: 'Feature' as const,
        id: el.id,
        geometry,
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
          ...Object.fromEntries(
            el.properties?.map(p => [`prop_${p.key}`, p.value]) ?? []
          ),
        },
      };
    });

    // Build features from links (as LineStrings if both endpoints have geo)
    const linkFeatures = links
      .map(link => {
        const fromEl = elementMap.get(link.fromId);
        const toEl = elementMap.get(link.toId);

        // Skip if either endpoint doesn't have geo
        if (!fromEl?.geo || !toEl?.geo) return null;
        const fromCenter = getGeoCenter(fromEl.geo);
        const toCenter = getGeoCenter(toEl.geo);
        if (fromCenter.lat === 0 && fromCenter.lng === 0) return null;
        if (toCenter.lat === 0 && toCenter.lng === 0) return null;

        return {
          type: 'Feature' as const,
          id: link.id,
          geometry: {
            type: 'LineString' as const,
            coordinates: [
              [fromCenter.lng, fromCenter.lat],
              [toCenter.lng, toCenter.lat],
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
      name: dossier.name,
      metadata: {
        exportedAt: new Date().toISOString(),
        source: 'zeroneurone',
        version: this.VERSION,
        dossier: {
          id: dossier.id,
          name: dossier.name,
          description: dossier.description,
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
   * Export and download dossier in specified format
   * @param assets - For ZIP format, the raw assets to include
   * @param report - For ZIP format, the optional report to include
   */
  async exportDossier(
    format: ExportFormat,
    dossier: Dossier,
    elements: Element[],
    links: Link[],
    assets?: Asset[],
    report?: Report | null,
    tabs?: CanvasTab[],
    views?: View[],
    queries?: SavedQuery[],
    queryHistory?: string[],
    comments?: Comment[]
  ): Promise<void> {
    const now = new Date();
    const timestamp = `${now.toISOString().slice(0, 10)}_${now.toTimeString().slice(0, 8).replace(/:/g, '-')}`;
    const baseName = `${dossier.name.replace(/[^a-z0-9]/gi, '_')}_${timestamp}`;

    switch (format) {
      case 'zip': {
        const zipBlob = await this.exportToZip(dossier, elements, links, assets || [], report, tabs, views, queries, queryHistory, comments);
        this.downloadBlob(zipBlob, `${baseName}.zip`);
        break;
      }
      case 'json': {
        const json = this.exportToJSON(dossier, elements, links, undefined, undefined, tabs, views, queries, queryHistory, comments);
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
        const graphml = this.exportToGraphML(dossier, elements, links);
        this.download(graphml, `${baseName}.graphml`, 'application/xml');
        break;
      }
      case 'gexf': {
        const gexf = this.exportToGEXF(dossier, elements, links);
        this.download(gexf, `${baseName}.gexf`, 'application/xml');
        break;
      }
      case 'geojson': {
        const geojson = this.exportToGeoJSON(dossier, elements, links);
        this.download(geojson, `${baseName}.geojson`, 'application/geo+json');
        break;
      }
    }
  }

  private escapeCSV(value: string): string {
    // Prevent spreadsheet formula injection (=, +, -, @, tab, carriage return)
    if (/^[=+\-@\t\r]/.test(value)) {
      value = "'" + value;
    }
    if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes("'")) {
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

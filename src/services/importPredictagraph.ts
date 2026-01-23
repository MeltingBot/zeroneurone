import { generateUUID } from '../utils';
import { DEFAULT_ELEMENT_VISUAL, DEFAULT_LINK_VISUAL } from '../types';
import type {
  InvestigationId,
  Element,
  ElementId,
  Link,
  Position,
  GeoCoordinates,
  Property,
  AssetId,
} from '../types';
import { db } from '../db/database';
import { fileService } from './fileService';
import type { ImportResult } from './importService';

// ============================================================================
// PredicaGraph Format Types
// ============================================================================

interface PredicaGraphNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: {
    label?: string;
    type?: string;
    notes?: Array<{ title?: string; content?: string }>;
    pfp_image?: string | { url?: string } | Array<{ url?: string; metadata?: unknown }>;
    [key: string]: unknown;
  };
  measured?: { width: number; height: number };
  [key: string]: unknown;
}

interface PredicaGraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  type?: string;
  style?: { stroke?: string };
  markerEnd?: unknown;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

interface PredicaGraphData {
  nodes: PredicaGraphNode[];
  edges: PredicaGraphEdge[];
  viewport?: { x: number; y: number; zoom: number };
}

// ============================================================================
// Type Mapping
// ============================================================================

const TYPE_TAG_MAP: Record<string, string> = {
  'person': 'Personne',
  'location': 'Lieu',
  'phone': 'Téléphone',
  'email': 'Email',
  'social-instagram': 'Instagram',
  'social-telegram': 'Telegram',
  'social-vk': 'VK',
  'social-facebook': 'Facebook',
  'social-medium': 'Medium',
  'social-protonmail': 'ProtonMail',
  'social-twitter': 'Twitter',
  'social-linkedin': 'LinkedIn',
  'social-tiktok': 'TikTok',
  'social-youtube': 'YouTube',
  'social-whatsapp': 'WhatsApp',
  'social-snapchat': 'Snapchat',
  'social-reddit': 'Reddit',
  'social-discord': 'Discord',
  'social-skype': 'Skype',
  'group-company': 'Entreprise',
  'group-group': 'Organisation',
  'media-video': 'Vidéo',
  'media-image': 'Image',
  'media-audio': 'Audio',
  'clearweb-article': 'Site web',
  'clearweb-domain': 'Domaine',
  'darkweb-article': 'Darkweb',
  'username': 'Pseudo',
  'custom-vessel': 'Navire',
  'custom-vehicle': 'Véhicule',
  'custom-document': 'Document',
  'cryptocurrency': 'Crypto',
  'ip-address': 'Adresse IP',
  'other': 'Autre',
};

// Data fields to extract as properties (exclude internal/meta fields)
const PROPERTY_FIELDS = [
  'name', 'email', 'phone', 'address', 'username', 'url',
  'description', 'bio', 'company', 'job_title', 'location',
  'country', 'city', 'state', 'zip', 'website',
  'followers', 'following', 'posts', 'subscribers',
  'registration_date', 'last_seen', 'birthday',
  'nationality', 'gender', 'age',
  'imo_number', 'mmsi', 'call_sign', 'flag',
  'plate_number', 'vin',
  'wallet_address', 'balance',
];

// ============================================================================
// Parser
// ============================================================================

/**
 * Import a PredicaGraph JSON export into an investigation
 */
export async function importPredicaGraph(
  content: string,
  targetInvestigationId: InvestigationId
): Promise<ImportResult> {
  const result: ImportResult = {
    success: false,
    elementsImported: 0,
    linksImported: 0,
    assetsImported: 0,
    errors: [],
    warnings: [],
  };

  try {
    const data = JSON.parse(content) as PredicaGraphData;

    if (!data.nodes || !Array.isArray(data.nodes)) {
      result.errors.push('Format PredicaGraph invalide: champ "nodes" manquant');
      return result;
    }

    // Create ID mapping (PredicaGraph ID -> new UUID)
    const nodeIdMap = new Map<string, ElementId>();
    let downloadedImageCount = 0;
    let failedImageCount = 0;

    // Count nodes with images for the warning
    const nodesWithImages = data.nodes.filter(n => {
      if (!n.data?.pfp_image) return false;
      let url: string | undefined;
      if (typeof n.data.pfp_image === 'string') url = n.data.pfp_image;
      else if (Array.isArray(n.data.pfp_image)) {
        const first = n.data.pfp_image.find(item => item?.url);
        if (first) url = first.url;
      } else if (typeof n.data.pfp_image === 'object' && n.data.pfp_image.url) url = n.data.pfp_image.url;
      return url && url.startsWith('http');
    });

    if (nodesWithImages.length > 0) {
      result.warnings.push(
        `Tentative de téléchargement de ${nodesWithImages.length} image(s) depuis PredicaGraph (peut échouer si CORS bloqué)...`
      );
    }

    // Import nodes
    for (const node of data.nodes) {
      if (!node.id || !node.position) {
        result.warnings.push(`Noeud ignoré: ID ou position manquant`);
        continue;
      }

      const nodeType = node.data?.type || 'other';
      const tag = TYPE_TAG_MAP[nodeType] || TYPE_TAG_MAP['other'] || 'Autre';
      const label = node.data?.label || node.id;

      // Extract properties from data fields
      const properties: Property[] = [];
      if (node.data) {
        for (const field of PROPERTY_FIELDS) {
          const value = node.data[field];
          if (value !== undefined && value !== null && value !== '') {
            properties.push({
              key: field,
              value: String(value),
              type: 'text',
            });
          }
        }
      }

      // Handle pfp_image: download from URL and save as asset
      const assetIds: AssetId[] = [];
      let visualImageId: AssetId | null = null;

      if (node.data?.pfp_image) {
        let imageUrl: string | undefined;
        if (typeof node.data.pfp_image === 'string') {
          imageUrl = node.data.pfp_image;
        } else if (Array.isArray(node.data.pfp_image)) {
          // Array of {url, metadata} objects - take first valid URL
          const firstWithUrl = node.data.pfp_image.find(item => item?.url);
          if (firstWithUrl) imageUrl = firstWithUrl.url;
        } else if (typeof node.data.pfp_image === 'object' && node.data.pfp_image.url) {
          imageUrl = node.data.pfp_image.url;
        }

        if (imageUrl && imageUrl.startsWith('http')) {
          try {
            const response = await fetch(imageUrl);
            if (response.ok) {
              const blob = await response.blob();
              const ext = blob.type.split('/')[1] || 'png';
              const filename = `${String(label).replace(/[^a-zA-Z0-9]/g, '_')}_pfp.${ext}`;
              const file = new File([blob], filename, { type: blob.type });
              const asset = await fileService.saveAsset(targetInvestigationId, file);
              assetIds.push(asset.id);
              visualImageId = asset.id;
              downloadedImageCount++;
              result.assetsImported++;
            } else {
              failedImageCount++;
              properties.push({ key: 'image_url', value: imageUrl, type: 'link' });
            }
          } catch {
            failedImageCount++;
            properties.push({ key: 'image_url', value: imageUrl, type: 'link' });
          }
        }
      }

      // Build notes from node notes array
      let notes = '';
      if (node.data?.notes && Array.isArray(node.data.notes)) {
        const noteParts: string[] = [];
        for (const note of node.data.notes) {
          if (note.title || note.content) {
            const parts: string[] = [];
            if (note.title) parts.push(`## ${note.title}`);
            if (note.content) parts.push(note.content);
            noteParts.push(parts.join('\n'));
          }
        }
        notes = noteParts.join('\n\n');
      }

      // Parse geo from data if available
      let geo: GeoCoordinates | null = null;
      if (node.data) {
        const lat = node.data.latitude || node.data.lat;
        const lng = node.data.longitude || node.data.lng || node.data.lon;
        if (lat !== undefined && lng !== undefined) {
          const latNum = typeof lat === 'number' ? lat : parseFloat(String(lat));
          const lngNum = typeof lng === 'number' ? lng : parseFloat(String(lng));
          if (!isNaN(latNum) && !isNaN(lngNum)) {
            geo = { lat: latNum, lng: lngNum };
          }
        }
      }

      const position: Position = {
        x: node.position.x,
        y: node.position.y,
      };

      const newId = generateUUID();
      nodeIdMap.set(node.id, newId);

      const element: Element = {
        id: newId,
        investigationId: targetInvestigationId,
        label: String(label),
        notes,
        tags: [tag],
        properties,
        confidence: null,
        source: 'PredicaGraph',
        date: null,
        dateRange: null,
        position,
        geo,
        visual: { ...DEFAULT_ELEMENT_VISUAL, image: visualImageId },
        assetIds,
        parentGroupId: null,
        isGroup: false,
        isAnnotation: false,
        childIds: [],
        events: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await db.elements.add(element);
      result.elementsImported++;
    }

    // Report download results
    if (downloadedImageCount > 0) {
      result.warnings.push(
        `${downloadedImageCount} image(s) téléchargée(s) depuis PredicaGraph`
      );
    }
    if (failedImageCount > 0) {
      result.warnings.push(
        `${failedImageCount} image(s) non téléchargée(s) (CORS bloqué): URLs stockées en propriétés`
      );
    }

    // Import edges
    if (data.edges && Array.isArray(data.edges)) {
      for (const edge of data.edges) {
        if (!edge.source || !edge.target) {
          result.warnings.push(`Lien ignoré: source ou target manquant`);
          continue;
        }

        const fromId = nodeIdMap.get(edge.source);
        const toId = nodeIdMap.get(edge.target);

        if (!fromId || !toId) {
          result.warnings.push(
            `Lien ignoré: noeud source (${edge.source}) ou target (${edge.target}) non trouvé`
          );
          continue;
        }

        // Parse edge color from style
        const edgeColor = edge.style?.stroke || DEFAULT_LINK_VISUAL.color;

        const link: Link = {
          id: generateUUID(),
          investigationId: targetInvestigationId,
          fromId,
          toId,
          sourceHandle: null,
          targetHandle: null,
          label: edge.label || '',
          notes: '',
          tags: [],
          properties: [],
          confidence: null,
          source: '',
          date: null,
          dateRange: null,
          directed: !!edge.markerEnd,
          direction: edge.markerEnd ? 'forward' : 'none',
          visual: {
            ...DEFAULT_LINK_VISUAL,
            color: edgeColor,
          },
          curveOffset: { x: 0, y: 0 },
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await db.links.add(link);
        result.linksImported++;
      }
    }

    // Update investigation viewport if available
    if (data.viewport) {
      await db.investigations.update(targetInvestigationId, {
        viewport: data.viewport,
        updatedAt: new Date(),
      });
    } else {
      await db.investigations.update(targetInvestigationId, {
        updatedAt: new Date(),
      });
    }

    result.success = result.elementsImported > 0;
  } catch (error) {
    result.errors.push(
      `Erreur d'import PredicaGraph: ${error instanceof Error ? error.message : 'Erreur inconnue'}`
    );
  }

  return result;
}

/**
 * Detect if JSON content is a PredicaGraph format
 */
export function isPredicaGraphFormat(data: unknown): boolean {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const obj = data as Record<string, unknown>;

  // Must have nodes array
  if (!Array.isArray(obj.nodes)) return false;

  // Must have edges array
  if (!Array.isArray(obj.edges)) return false;

  // Check first node has PredicaGraph-style data.type
  if (obj.nodes.length > 0) {
    const firstNode = obj.nodes[0] as Record<string, unknown>;
    if (firstNode.data && typeof firstNode.data === 'object') {
      const nodeData = firstNode.data as Record<string, unknown>;
      // PredicaGraph nodes have data.type like 'person', 'location', 'social-*'
      if (typeof nodeData.type === 'string') {
        return true;
      }
    }
  }

  return false;
}

// ============================================================================
// IDENTIFIERS
// ============================================================================

/** All IDs are UUID v4 */
export type UUID = string;

export type InvestigationId = UUID;
export type ElementId = UUID;
export type LinkId = UUID;
export type CommentId = UUID;
export type AssetId = UUID;
export type ViewId = UUID;
export type ReportSectionId = UUID;
export type TagSetId = UUID;
export type TabId = UUID;

// ============================================================================
// UTILITY TYPES
// ============================================================================

/** Position on the canvas */
export interface Position {
  x: number;
  y: number;
}

/** Geographic coordinates */
export interface GeoCoordinates {
  lat: number;
  lng: number;
}

/** Element event - tracks any temporal occurrence for an element */
export interface ElementEvent {
  id: string;           // UUID for the event
  date: Date;           // When this event occurred/started
  dateEnd?: Date;       // When it ended (optional, for events with duration)
  label: string;        // User-defined: "Escale Marseille", "Site piraté", "Changement proprio"
  description?: string; // Detailed description (optional)

  // Optional contextual data - user adds what's relevant
  geo?: GeoCoordinates; // If present, event appears on map
  properties?: Property[]; // Typed properties (same system as elements/links)
  source?: string;      // Source of this information
}

/** Date range for timeline */
export interface DateRange {
  start: Date | null;
  end: Date | null;
}

/** Property types for typed input */
export type PropertyType = 'text' | 'number' | 'date' | 'datetime' | 'boolean' | 'choice' | 'geo' | 'country' | 'link';

/** Free-form property (key/value) with optional type */
export interface Property {
  key: string;
  value: string | number | boolean | Date | null;
  type?: PropertyType;
}

/** Property definition for suggestions (includes type info) */
export interface PropertyDefinition {
  key: string;
  type: PropertyType;
  /** Available options for 'choice' type */
  choices?: string[];
}

// ============================================================================
// TAGSET
// ============================================================================

/** Suggested property for a TagSet */
export interface SuggestedProperty {
  key: string;
  type: PropertyType;
  description: string;
  placeholder: string;
  /** Available options for 'choice' type */
  choices?: string[];
}

/** Default visual appearance for a TagSet */
export interface TagSetDefaultVisual {
  color: string | null;
  shape: ElementShape | null;
  icon: string | null;
}

/** TagSet - reusable tag definition with suggested properties */
export interface TagSet {
  id: TagSetId;
  /** Tag name (unique, case-insensitive) */
  name: string;
  /** Description for the user */
  description: string;
  /** Default appearance when this tag is applied */
  defaultVisual: TagSetDefaultVisual;
  /** Suggested properties for this tag */
  suggestedProperties: SuggestedProperty[];
  /** Built-in TagSets cannot be deleted */
  isBuiltIn: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Font size presets for elements and links */
export type FontSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

/** Font size preset to pixel mapping */
export const FONT_SIZE_PX: Record<FontSize, number> = {
  xs: 8, sm: 12, md: 14, lg: 18, xl: 22,
};

/** Element visual appearance */
export interface ElementVisual {
  color: string;
  borderColor: string;
  borderWidth?: number;  // default: 2
  borderStyle?: 'solid' | 'dashed' | 'dotted';  // default: 'solid'
  shape: ElementShape;
  size: ElementSize;
  icon: string | null;
  image: AssetId | null;
  customWidth?: number;
  customHeight?: number;
  fontSize?: FontSize;
}

export type ElementShape = 'circle' | 'square' | 'diamond' | 'rectangle';
export type ElementSize = 'small' | 'medium' | 'large' | number;

/** Link visual appearance */
export interface LinkVisual {
  color: string;
  style: LinkStyle;
  thickness: number;
  fontSize?: FontSize;
}

export type LinkStyle = 'solid' | 'dashed' | 'dotted';

/** Link direction for arrows */
export type LinkDirection = 'none' | 'forward' | 'backward' | 'both';

/** Confidence level (0-100 in steps of 10) */
export type Confidence = 0 | 10 | 20 | 30 | 40 | 50 | 60 | 70 | 80 | 90 | 100;

// ============================================================================
// INVESTIGATION
// ============================================================================

export interface Investigation {
  id: InvestigationId;
  name: string;
  description: string;
  startDate: Date | null;
  creator: string;
  /** Tags for organizing investigations (e.g., "Cyber", "Client-X", "2026") */
  tags: string[];
  properties: Property[];
  createdAt: Date;
  updatedAt: Date;
  viewport: {
    x: number;
    y: number;
    zoom: number;
  };
  settings: InvestigationSettings;
  /** Whether this investigation is pinned/favorited for quick access */
  isFavorite?: boolean;
}

export interface InvestigationSettings {
  defaultElementVisual: Partial<ElementVisual>;
  defaultLinkVisual: Partial<LinkVisual>;
  /** Property definitions with types for suggestions */
  suggestedProperties: PropertyDefinition[];
  existingTags: string[];
  /** Properties associated with each tag (e.g., "Entreprise" -> [{key: "SIREN", type: "text"}]) */
  tagPropertyAssociations: Record<string, PropertyDefinition[]>;
  /** Show confidence indicator (🤝 + %) on elements and links */
  showConfidenceIndicator?: boolean;
  /** Property keys to display on elements/links (e.g., ["SIREN", "Email"]) */
  displayedProperties?: string[];
  /** Tag display mode on canvas elements: none, icons only, labels only, or both */
  tagDisplayMode?: 'none' | 'icons' | 'labels' | 'both';
  /** Tag display size on canvas elements */
  tagDisplaySize?: 'small' | 'medium' | 'large';
  /** Link anchor mode: auto (system chooses best handles) or manual (user controls) */
  linkAnchorMode?: 'auto' | 'manual';
  /** Link curve mode: straight lines, curved bezier, or orthogonal (right angles) */
  linkCurveMode?: 'straight' | 'curved' | 'orthogonal';
}

// ============================================================================
// ELEMENT
// ============================================================================

export interface Element {
  id: ElementId;
  investigationId: InvestigationId;
  label: string;
  notes: string;
  tags: string[];
  properties: Property[];
  confidence: Confidence | null;
  source: string;
  date: Date | null;
  dateRange: DateRange | null;
  position: Position;
  /** When true, the element cannot be moved on the canvas */
  isPositionLocked: boolean;
  /** Current/default geo position (for simple cases without history) */
  geo: GeoCoordinates | null;
  /** Event history - all temporal occurrences for this element */
  events: ElementEvent[];
  visual: ElementVisual;
  assetIds: AssetId[];
  parentGroupId: ElementId | null;
  isGroup: boolean;
  isAnnotation: boolean;
  childIds: ElementId[];
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// LINK
// ============================================================================

export interface Link {
  id: LinkId;
  investigationId: InvestigationId;
  fromId: ElementId;
  toId: ElementId;
  sourceHandle: string | null;
  targetHandle: string | null;
  label: string;
  notes: string;
  tags: string[];
  properties: Property[];
  directed: boolean; // @deprecated - use direction instead
  direction: LinkDirection;
  confidence: Confidence | null;
  source: string;
  date: Date | null;
  dateRange: DateRange | null;
  visual: LinkVisual;
  /** Manual curve control point offset from midpoint (pixels) */
  curveOffset: { x: number; y: number };
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// COMMENT
// ============================================================================

export type CommentTargetType = 'element' | 'link';

export interface Comment {
  id: CommentId;
  investigationId: InvestigationId;
  targetId: ElementId | LinkId;
  targetType: CommentTargetType;
  authorName: string;
  authorColor: string;
  content: string;
  resolved: boolean;
  resolvedBy: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
}

// ============================================================================
// ASSET
// ============================================================================

export interface Asset {
  id: AssetId;
  investigationId: InvestigationId;
  filename: string;
  mimeType: string;
  size: number;
  hash: string;
  opfsPath: string;
  thumbnailDataUrl: string | null;
  extractedText: string | null;
  createdAt: Date;
}

// ============================================================================
// VIEW
// ============================================================================

export interface View {
  id: ViewId;
  investigationId: InvestigationId;
  name: string;
  viewport: {
    x: number;
    y: number;
    zoom: number;
  };
  filters: ViewFilters;
  hiddenElementIds: ElementId[];
  displayMode: DisplayMode;
  /** Optional saved element positions for layout restoration */
  elementPositions?: { id: ElementId; position: Position }[];
  /** Optional active tab when view was saved */
  activeTabId?: TabId | null;
  createdAt: Date;
  updatedAt: Date;
}

export type DisplayMode = 'canvas' | 'map' | 'timeline' | 'matrix';

export interface ViewFilters {
  includeTags: string[];
  excludeTags: string[];
  hasProperty: string | null;
  /** Property key to display as badge on elements (with flag for country type) */
  badgePropertyKey: string | null;
  textSearch: string;
  minConfidence: Confidence | null;
  dateFrom: Date | null;
  dateTo: Date | null;
  hasGeo: boolean | null;
}

// ============================================================================
// CANVAS TAB
// ============================================================================

export interface CanvasTab {
  id: TabId;
  investigationId: InvestigationId;
  name: string;
  order: number;
  memberElementIds: ElementId[];
  /** Ghost element IDs explicitly dismissed by the user (won't reappear as ghosts) */
  excludedElementIds: ElementId[];
  viewport: { x: number; y: number; zoom: number };
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// REPORT
// ============================================================================

export interface Report {
  id: UUID;
  investigationId: InvestigationId;
  title: string;
  sections: ReportSection[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ReportSection {
  id: ReportSectionId;
  title: string;
  order: number;
  content: string;
  elementIds: ElementId[];
  graphSnapshot: GraphSnapshot | null;
}

export interface GraphSnapshot {
  imageDataUrl: string;
  viewport: { x: number; y: number; zoom: number };
  capturedAt: Date;
}

// ============================================================================
// SEARCH
// ============================================================================

export interface SearchDocument {
  id: string;
  type: 'element' | 'link';
  investigationId: InvestigationId;
  label: string;
  notes: string;
  tags: string;
  properties: string;
  extractedText: string;
}

export interface SearchResult {
  id: string;
  type: 'element' | 'link';
  score: number;
  matches: Record<string, string[]>;
}

// ============================================================================
// INSIGHTS
// ============================================================================

export interface Cluster {
  id: number;
  elementIds: ElementId[];
  size: number;
}

export interface CentralityResult {
  elementId: ElementId;
  degree: number;
  score: number;
}

export interface SimilarPair {
  elementId1: ElementId;
  elementId2: ElementId;
  similarity: number;
}

// ============================================================================
// UI TYPES
// ============================================================================

export type ModalType =
  | 'create-investigation'
  | 'import-investigation'
  | 'import-csv'
  | 'export'
  | 'report'
  | 'focus'
  | 'paths'
  | 'create-view'
  | 'create-group'
  | 'confirm-delete'
  | 'tagset-manager';

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration?: number;
}

export type ToolType = 'select' | 'create-element' | 'create-link';

export type SidePanelTab = 'detail' | 'insights' | 'views' | 'filters';

// ============================================================================
// DEFAULT VALUES
// ============================================================================

export const DEFAULT_ELEMENT_VISUAL: ElementVisual = {
  color: '#f5f5f4', // neutral light gray - works on both light and dark themes
  borderColor: '#a8a29e', // warm gray border
  borderWidth: 2,
  borderStyle: 'solid',
  shape: 'circle',
  size: 'medium',
  icon: null,
  image: null,
};

export const DEFAULT_LINK_VISUAL: LinkVisual = {
  color: 'var(--color-text-tertiary)', // warm gray, adapts to theme
  style: 'solid',
  thickness: 2,
};

export const DEFAULT_FILTERS: ViewFilters = {
  includeTags: [],
  excludeTags: [],
  hasProperty: null,
  badgePropertyKey: null,
  textSearch: '',
  minConfidence: null,
  dateFrom: null,
  dateTo: null,
  hasGeo: null,
};

// Saturated colors for nodes - work well on both light and dark backgrounds
// These use CSS variables to automatically adapt to the current theme
export const DEFAULT_COLORS = [
  'var(--color-node-yellow)',
  'var(--color-node-pink)',
  'var(--color-node-blue)',
  'var(--color-node-green)',
  'var(--color-node-orange)',
  'var(--color-node-purple)',
  'var(--color-node-red)',
  'var(--color-node-cyan)',
  'var(--color-node-lime)',
];

// Fallback colors for when CSS variables aren't available (e.g., exports)
export const FALLBACK_NODE_COLORS = [
  '#fcd34d', // yellow
  '#f9a8d4', // pink
  '#93c5fd', // blue
  '#86efac', // green
  '#fdba74', // orange
  '#c4b5fd', // purple
  '#fca5a5', // red
  '#67e8f9', // cyan
  '#bef264', // lime
];

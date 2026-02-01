/**
 * Genealogy Layout Service
 * Positions genealogy elements in a tree layout using recursive subtree positioning
 */

import type { Element, Link, ElementId } from '../../types';
import type { GenealogyImportOptions } from './types';

interface LayoutOptions {
  nodeWidth: number;
  nodeHeight: number;
  levelHeight: number;
  siblingGap: number;
  coupleGap: number;
  branchGap: number;
  direction: 'TB' | 'BT';
}

const DEFAULT_LAYOUT_OPTIONS: LayoutOptions = {
  nodeWidth: 160,
  nodeHeight: 60,
  levelHeight: 120,
  siblingGap: 20,
  coupleGap: 60,  // Enough space to see marriage link
  branchGap: 40,
  direction: 'TB',
};

// Compact options for large trees (100+ elements)
const COMPACT_LAYOUT_OPTIONS: LayoutOptions = {
  nodeWidth: 130,
  nodeHeight: 50,
  levelHeight: 100,
  siblingGap: 8,
  coupleGap: 50,  // Visible marriage link
  branchGap: 20,
  direction: 'TB',
};

// Very compact for huge trees (500+ elements)
const VERY_COMPACT_LAYOUT_OPTIONS: LayoutOptions = {
  nodeWidth: 100,
  nodeHeight: 40,
  levelHeight: 80,
  siblingGap: 4,
  coupleGap: 40,  // Visible marriage link
  branchGap: 12,
  direction: 'TB',
};

// Ultra compact for massive trees (1500+ elements)
const ULTRA_COMPACT_LAYOUT_OPTIONS: LayoutOptions = {
  nodeWidth: 80,
  nodeHeight: 35,
  levelHeight: 65,
  siblingGap: 2,
  coupleGap: 30,  // Minimum visible marriage link
  branchGap: 8,
  direction: 'TB',
};

interface FamilyUnit {
  id: string;
  husband?: ElementId;
  wife?: ElementId;
  children: ElementId[];
}

interface SubtreeInfo {
  width: number;
  leftOffset: number; // Where the "anchor point" (center of parents) is within the subtree
}

/**
 * Apply tree layout to genealogy elements
 * Modifies element positions in place
 */
export function applyGenealogyLayout(
  elements: Partial<Element>[],
  links: Partial<Link>[],
  options: GenealogyImportOptions
): void {
  // Select layout options based on tree size
  let baseOptions: LayoutOptions;
  if (elements.length >= 1500) {
    baseOptions = ULTRA_COMPACT_LAYOUT_OPTIONS;
  } else if (elements.length >= 500) {
    baseOptions = VERY_COMPACT_LAYOUT_OPTIONS;
  } else if (elements.length >= 100) {
    baseOptions = COMPACT_LAYOUT_OPTIONS;
  } else {
    baseOptions = DEFAULT_LAYOUT_OPTIONS;
  }

  const layoutOptions: LayoutOptions = {
    ...baseOptions,
    direction: options.layoutDirection,
  };

  // Build element lookup
  const elementMap = new Map<ElementId, Partial<Element>>();
  for (const el of elements) {
    if (el.id) {
      elementMap.set(el.id as ElementId, el);
    }
  }

  // Build family units from links
  const familyUnits = buildFamilyUnits(elements, links);

  // Build parent-child relationships
  const childToParents = buildChildToParentsMap(familyUnits);
  const parentToFamilies = buildParentToFamiliesMap(familyUnits);

  // Assign generations
  const generations = assignGenerations(elements, childToParents, familyUnits);

  // Find max generation
  let maxGeneration = 0;
  for (const gen of generations.values()) {
    maxGeneration = Math.max(maxGeneration, gen);
  }

  // Find root families (families where parents have no parents themselves)
  const rootFamilies = findRootFamilies(familyUnits, childToParents);

  // Find orphan elements (no family connections)
  const allInFamilies = new Set<ElementId>();
  for (const unit of familyUnits.values()) {
    if (unit.husband) allInFamilies.add(unit.husband);
    if (unit.wife) allInFamilies.add(unit.wife);
    for (const child of unit.children) {
      allInFamilies.add(child);
    }
  }
  const orphans: ElementId[] = [];
  for (const el of elements) {
    if (el.id && !allInFamilies.has(el.id as ElementId)) {
      orphans.push(el.id as ElementId);
    }
  }

  // Calculate subtree widths recursively for each root family
  const subtreeWidths = new Map<string, SubtreeInfo>();
  for (const familyId of rootFamilies) {
    calculateSubtreeWidth(familyId, familyUnits, parentToFamilies, subtreeWidths, layoutOptions);
  }

  // Position root families side by side
  let currentX = 0;
  for (const familyId of rootFamilies) {
    const subtreeInfo = subtreeWidths.get(familyId) || { width: layoutOptions.nodeWidth * 2, leftOffset: layoutOptions.nodeWidth };

    positionFamily(
      familyId,
      currentX + subtreeInfo.leftOffset,
      0,
      familyUnits,
      parentToFamilies,
      elementMap,
      generations,
      maxGeneration,
      subtreeWidths,
      layoutOptions
    );

    currentX += subtreeInfo.width + layoutOptions.branchGap;
  }

  // Position orphans at the end
  if (orphans.length > 0) {
    let orphanX = currentX;
    for (const orphanId of orphans) {
      const el = elementMap.get(orphanId);
      const gen = generations.get(orphanId) || 0;
      if (el) {
        const y = layoutOptions.direction === 'TB'
          ? gen * layoutOptions.levelHeight
          : (maxGeneration - gen) * layoutOptions.levelHeight;
        el.position = { x: orphanX, y };
        orphanX += layoutOptions.nodeWidth + layoutOptions.siblingGap;
      }
    }
  }

  // Center the entire tree around origin
  centerAroundOrigin(elements);
}

/**
 * Build family units from marriage and parent links
 */
function buildFamilyUnits(
  _elements: Partial<Element>[],
  links: Partial<Link>[]
): Map<string, FamilyUnit> {
  const familyUnits = new Map<string, FamilyUnit>();

  // Find marriage links to identify couples
  const marriages = links.filter(l => l.label === 'marié(e) à');
  const parentLinks = links.filter(l => l.label === 'parent de');

  for (const marriage of marriages) {
    if (!marriage.fromId || !marriage.toId) continue;

    const familyId = marriage.properties?.find(p => p.key === 'ID famille')?.value as string || `fam_${marriage.id}`;

    const unit: FamilyUnit = {
      id: familyId,
      husband: marriage.fromId as ElementId,
      wife: marriage.toId as ElementId,
      children: [],
    };

    familyUnits.set(familyId, unit);
  }

  // Assign children to family units
  for (const link of parentLinks) {
    if (!link.fromId || !link.toId) continue;

    const familyId = link.properties?.find(p => p.key === 'ID famille')?.value as string;
    if (!familyId) continue;

    const unit = familyUnits.get(familyId);
    if (unit && !unit.children.includes(link.toId as ElementId)) {
      unit.children.push(link.toId as ElementId);
    }
  }

  return familyUnits;
}

/**
 * Build child to parents mapping
 */
function buildChildToParentsMap(
  familyUnits: Map<string, FamilyUnit>
): Map<ElementId, Set<ElementId>> {
  const childToParents = new Map<ElementId, Set<ElementId>>();

  for (const unit of familyUnits.values()) {
    for (const childId of unit.children) {
      if (!childToParents.has(childId)) {
        childToParents.set(childId, new Set());
      }
      if (unit.husband) childToParents.get(childId)!.add(unit.husband);
      if (unit.wife) childToParents.get(childId)!.add(unit.wife);
    }
  }

  return childToParents;
}

/**
 * Build parent to families mapping (which families is this person a parent in)
 */
function buildParentToFamiliesMap(
  familyUnits: Map<string, FamilyUnit>
): Map<ElementId, string[]> {
  const parentToFamilies = new Map<ElementId, string[]>();

  for (const [familyId, unit] of familyUnits) {
    if (unit.husband) {
      if (!parentToFamilies.has(unit.husband)) {
        parentToFamilies.set(unit.husband, []);
      }
      parentToFamilies.get(unit.husband)!.push(familyId);
    }
    if (unit.wife) {
      if (!parentToFamilies.has(unit.wife)) {
        parentToFamilies.set(unit.wife, []);
      }
      parentToFamilies.get(unit.wife)!.push(familyId);
    }
  }

  return parentToFamilies;
}

/**
 * Find root families (where neither parent has parents)
 */
function findRootFamilies(
  familyUnits: Map<string, FamilyUnit>,
  childToParents: Map<ElementId, Set<ElementId>>
): string[] {
  const rootFamilies: string[] = [];

  for (const [familyId, unit] of familyUnits) {
    const husbandHasParents = unit.husband && childToParents.has(unit.husband);
    const wifeHasParents = unit.wife && childToParents.has(unit.wife);

    // Root family if neither spouse has parents
    if (!husbandHasParents && !wifeHasParents) {
      rootFamilies.push(familyId);
    }
  }

  // If no root families found (circular reference?), use all families
  if (rootFamilies.length === 0) {
    return Array.from(familyUnits.keys());
  }

  return rootFamilies;
}

/**
 * Assign generation numbers to elements
 */
function assignGenerations(
  elements: Partial<Element>[],
  childToParents: Map<ElementId, Set<ElementId>>,
  familyUnits: Map<string, FamilyUnit>
): Map<ElementId, number> {
  const generations = new Map<ElementId, number>();

  // Find roots (elements with no parents)
  const roots: ElementId[] = [];
  for (const el of elements) {
    if (el.id && !childToParents.has(el.id as ElementId)) {
      roots.push(el.id as ElementId);
      generations.set(el.id as ElementId, 0);
    }
  }

  // BFS to assign generations
  const queue = [...roots];
  const visited = new Set<ElementId>(roots);

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const currentGen = generations.get(currentId) || 0;

    // Find children of this element
    for (const unit of familyUnits.values()) {
      const isParent = unit.husband === currentId || unit.wife === currentId;
      if (!isParent) continue;

      for (const childId of unit.children) {
        const existingGen = generations.get(childId);
        const newGen = currentGen + 1;

        if (existingGen === undefined || newGen > existingGen) {
          generations.set(childId, newGen);
        }

        if (!visited.has(childId)) {
          visited.add(childId);
          queue.push(childId);
        }
      }

      // Ensure spouse has same generation
      if (unit.husband && unit.wife) {
        const spouse = currentId === unit.husband ? unit.wife : unit.husband;
        const existingSpouseGen = generations.get(spouse);
        if (existingSpouseGen === undefined || currentGen > existingSpouseGen) {
          generations.set(spouse, currentGen);
        }
      }
    }
  }

  // Sync spouse generations
  for (const unit of familyUnits.values()) {
    if (unit.husband && unit.wife) {
      const husbandGen = generations.get(unit.husband);
      const wifeGen = generations.get(unit.wife);
      if (husbandGen !== undefined && wifeGen !== undefined) {
        const maxGen = Math.max(husbandGen, wifeGen);
        generations.set(unit.husband, maxGen);
        generations.set(unit.wife, maxGen);
      }
    }
  }

  // Handle unvisited elements
  for (const el of elements) {
    if (el.id && !generations.has(el.id as ElementId)) {
      generations.set(el.id as ElementId, 0);
    }
  }

  return generations;
}

/**
 * Calculate the width of a family's subtree (recursive)
 */
function calculateSubtreeWidth(
  familyId: string,
  familyUnits: Map<string, FamilyUnit>,
  parentToFamilies: Map<ElementId, string[]>,
  subtreeWidths: Map<string, SubtreeInfo>,
  options: LayoutOptions
): SubtreeInfo {
  // Return cached value if already calculated
  if (subtreeWidths.has(familyId)) {
    return subtreeWidths.get(familyId)!;
  }

  const family = familyUnits.get(familyId);
  if (!family) {
    const info = { width: options.nodeWidth, leftOffset: options.nodeWidth / 2 };
    subtreeWidths.set(familyId, info);
    return info;
  }

  // Width of the couple
  const coupleWidth = options.nodeWidth * 2 + options.coupleGap;

  // Find all child families (families where children of this family are parents)
  const childFamilies: string[] = [];
  for (const childId of family.children) {
    const childsFamilies = parentToFamilies.get(childId) || [];
    for (const cf of childsFamilies) {
      if (!childFamilies.includes(cf)) {
        childFamilies.push(cf);
      }
    }
  }

  // Calculate width of all descendant subtrees
  let descendantsWidth = 0;
  const childSubtreeInfos: SubtreeInfo[] = [];

  if (childFamilies.length > 0) {
    for (const childFamilyId of childFamilies) {
      const childInfo = calculateSubtreeWidth(childFamilyId, familyUnits, parentToFamilies, subtreeWidths, options);
      childSubtreeInfos.push(childInfo);
      descendantsWidth += childInfo.width;
    }
    descendantsWidth += (childFamilies.length - 1) * options.siblingGap;
  } else if (family.children.length > 0) {
    // Leaf children (no families of their own)
    descendantsWidth = family.children.length * options.nodeWidth + (family.children.length - 1) * options.siblingGap;
  }

  // Total width is max of couple width and descendants width
  const totalWidth = Math.max(coupleWidth, descendantsWidth);

  // Left offset is where the center of the couple should be
  const leftOffset = totalWidth / 2;

  const info = { width: totalWidth, leftOffset };
  subtreeWidths.set(familyId, info);
  return info;
}

/**
 * Position a family and its descendants
 */
function positionFamily(
  familyId: string,
  centerX: number,
  generation: number,
  familyUnits: Map<string, FamilyUnit>,
  parentToFamilies: Map<ElementId, string[]>,
  elementMap: Map<ElementId, Partial<Element>>,
  generations: Map<ElementId, number>,
  maxGeneration: number,
  subtreeWidths: Map<string, SubtreeInfo>,
  options: LayoutOptions
): void {
  const family = familyUnits.get(familyId);
  if (!family) return;

  // Calculate Y based on direction
  const y = options.direction === 'TB'
    ? generation * options.levelHeight
    : (maxGeneration - generation) * options.levelHeight;

  // Position the couple centered at centerX
  if (family.husband) {
    const el = elementMap.get(family.husband);
    if (el) {
      el.position = { x: centerX - options.nodeWidth - options.coupleGap / 2, y };
    }
  }
  if (family.wife) {
    const el = elementMap.get(family.wife);
    if (el) {
      el.position = { x: centerX + options.coupleGap / 2, y };
    }
  }

  // Find child families and leaf children
  const childFamilies: string[] = [];
  const leafChildren: ElementId[] = [];
  const processedChildren = new Set<ElementId>();

  for (const childId of family.children) {
    const childsFamilies = parentToFamilies.get(childId) || [];
    if (childsFamilies.length > 0) {
      for (const cf of childsFamilies) {
        if (!childFamilies.includes(cf)) {
          childFamilies.push(cf);
          // Mark both parents as processed
          const cfUnit = familyUnits.get(cf);
          if (cfUnit) {
            if (cfUnit.husband) processedChildren.add(cfUnit.husband);
            if (cfUnit.wife) processedChildren.add(cfUnit.wife);
          }
        }
      }
    } else {
      leafChildren.push(childId);
    }
  }

  // Calculate total width of children
  let totalChildWidth = 0;
  const childInfos: { id: string; info: SubtreeInfo }[] = [];

  for (const childFamilyId of childFamilies) {
    const info = subtreeWidths.get(childFamilyId) || { width: options.nodeWidth * 2, leftOffset: options.nodeWidth };
    childInfos.push({ id: childFamilyId, info });
    totalChildWidth += info.width;
  }

  if (leafChildren.length > 0) {
    totalChildWidth += leafChildren.length * options.nodeWidth;
    if (childFamilies.length > 0) {
      totalChildWidth += options.siblingGap;
    }
    totalChildWidth += (leafChildren.length - 1) * options.siblingGap;
  }

  if (childFamilies.length > 1) {
    totalChildWidth += (childFamilies.length - 1) * options.siblingGap;
  }

  // Position children centered under parents
  let childX = centerX - totalChildWidth / 2;
  const childGeneration = generation + 1;

  // Position child families
  for (const { id: childFamilyId, info } of childInfos) {
    positionFamily(
      childFamilyId,
      childX + info.leftOffset,
      childGeneration,
      familyUnits,
      parentToFamilies,
      elementMap,
      generations,
      maxGeneration,
      subtreeWidths,
      options
    );
    childX += info.width + options.siblingGap;
  }

  // Position leaf children
  const leafY = options.direction === 'TB'
    ? childGeneration * options.levelHeight
    : (maxGeneration - childGeneration) * options.levelHeight;

  for (const leafId of leafChildren) {
    const el = elementMap.get(leafId);
    if (el) {
      el.position = { x: childX + options.nodeWidth / 2, y: leafY };
    }
    childX += options.nodeWidth + options.siblingGap;
  }
}

/**
 * Center all elements around origin
 */
function centerAroundOrigin(elements: Partial<Element>[]): void {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;

  for (const el of elements) {
    if (el.position) {
      minX = Math.min(minX, el.position.x);
      maxX = Math.max(maxX, el.position.x);
      minY = Math.min(minY, el.position.y);
    }
  }

  if (!isFinite(minX)) return;

  const centerX = (minX + maxX) / 2;
  const offsetX = -centerX;
  const offsetY = -minY + 100; // Start 100px from top

  for (const el of elements) {
    if (el.position) {
      el.position = {
        x: el.position.x + offsetX,
        y: el.position.y + offsetY,
      };
    }
  }
}

/**
 * Calculate bounding box for positioned elements
 */
export function calculateBoundingBox(
  elements: Partial<Element>[]
): { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const el of elements) {
    if (el.position) {
      minX = Math.min(minX, el.position.x);
      minY = Math.min(minY, el.position.y);
      maxX = Math.max(maxX, el.position.x + 180);
      maxY = Math.max(maxY, el.position.y + 60);
    }
  }

  if (!isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Offset all element positions by a given amount
 */
export function offsetPositions(
  elements: Partial<Element>[],
  offsetX: number,
  offsetY: number
): void {
  for (const el of elements) {
    if (el.position) {
      el.position = {
        x: el.position.x + offsetX,
        y: el.position.y + offsetY,
      };
    }
  }
}

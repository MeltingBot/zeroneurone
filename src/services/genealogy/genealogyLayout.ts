/**
 * Genealogy Layout Service
 * Positions genealogy elements in a tree layout
 */

import type { Element, Link, ElementId } from '../../types';
import type { GenealogyImportOptions } from './types';

interface LayoutOptions {
  nodeWidth: number;
  nodeHeight: number;
  levelHeight: number;
  siblingGap: number;
  coupleGap: number;
  direction: 'TB' | 'BT';
}

const DEFAULT_LAYOUT_OPTIONS: LayoutOptions = {
  nodeWidth: 180,
  nodeHeight: 60,
  levelHeight: 120,
  siblingGap: 40,
  coupleGap: 20,
  direction: 'TB',
};

interface FamilyUnit {
  husband?: ElementId;
  wife?: ElementId;
  children: ElementId[];
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
  const layoutOptions: LayoutOptions = {
    ...DEFAULT_LAYOUT_OPTIONS,
    direction: options.layoutDirection,
  };

  // Build family units from links
  const familyUnits = buildFamilyUnits(elements, links);

  // Assign generations
  const generations = assignGenerations(elements, familyUnits);

  // Position by generation
  positionByGeneration(elements, generations, familyUnits, layoutOptions);
}

/**
 * Build family units from marriage and parent links
 */
function buildFamilyUnits(
  elements: Partial<Element>[],
  links: Partial<Link>[]
): Map<string, FamilyUnit> {
  const familyUnits = new Map<string, FamilyUnit>();
  const elementMap = new Map<ElementId, Partial<Element>>();

  for (const el of elements) {
    if (el.id) {
      elementMap.set(el.id as ElementId, el);
    }
  }

  // Find marriage links to identify couples
  const marriages = links.filter(l => l.label === 'marié(e) à');
  const parentLinks = links.filter(l => l.label === 'parent de');

  for (const marriage of marriages) {
    if (!marriage.fromId || !marriage.toId) continue;

    const familyId = marriage.properties?.find(p => p.key === 'ID famille')?.value as string || `fam_${marriage.id}`;

    const unit: FamilyUnit = {
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
 * Assign generation numbers to elements
 * Generation 0 = oldest ancestors (no parents)
 */
function assignGenerations(
  elements: Partial<Element>[],
  familyUnits: Map<string, FamilyUnit>
): Map<ElementId, number> {
  const generations = new Map<ElementId, number>();
  const childToParents = new Map<ElementId, Set<ElementId>>();

  // Build child → parents mapping
  for (const unit of familyUnits.values()) {
    for (const childId of unit.children) {
      if (!childToParents.has(childId)) {
        childToParents.set(childId, new Set());
      }
      if (unit.husband) childToParents.get(childId)!.add(unit.husband);
      if (unit.wife) childToParents.get(childId)!.add(unit.wife);
    }
  }

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

        // Use the maximum generation (in case of multiple paths)
        if (existingGen === undefined || newGen > existingGen) {
          generations.set(childId, newGen);
        }

        if (!visited.has(childId)) {
          visited.add(childId);
          queue.push(childId);
        }
      }

      // Ensure spouse has same generation (update even if already set to lower value)
      if (unit.husband && unit.wife) {
        const spouse = currentId === unit.husband ? unit.wife : unit.husband;
        const existingSpouseGen = generations.get(spouse);
        // Update if spouse doesn't have a generation or has a lower one
        if (existingSpouseGen === undefined || currentGen > existingSpouseGen) {
          generations.set(spouse, currentGen);
        }
      }
    }
  }

  // Second pass: sync spouse generations to ensure couples are on same level
  // This handles cases where spouse was processed before their partner
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

  // Handle unvisited elements (isolated or complex relationships)
  for (const el of elements) {
    if (el.id && !generations.has(el.id as ElementId)) {
      generations.set(el.id as ElementId, 0);
    }
  }

  return generations;
}

/**
 * Position elements by generation
 */
function positionByGeneration(
  elements: Partial<Element>[],
  generations: Map<ElementId, number>,
  familyUnits: Map<string, FamilyUnit>,
  options: LayoutOptions
): void {
  // Group elements by generation
  const byGeneration = new Map<number, ElementId[]>();
  let maxGeneration = 0;

  for (const [id, gen] of generations) {
    if (!byGeneration.has(gen)) {
      byGeneration.set(gen, []);
    }
    byGeneration.get(gen)!.push(id);
    maxGeneration = Math.max(maxGeneration, gen);
  }

  // Create element lookup
  const elementMap = new Map<ElementId, Partial<Element>>();
  for (const el of elements) {
    if (el.id) {
      elementMap.set(el.id as ElementId, el);
    }
  }

  // Track positioned couples to keep them together
  const couplePositions = new Map<string, { x: number; width: number }>();

  // Position each generation
  for (let gen = 0; gen <= maxGeneration; gen++) {
    const genElements = byGeneration.get(gen) || [];
    if (genElements.length === 0) continue;

    // Calculate Y based on direction
    const y = options.direction === 'TB'
      ? gen * options.levelHeight
      : (maxGeneration - gen) * options.levelHeight;

    // Group by couples and singles
    const couples: [ElementId, ElementId][] = [];
    const singles: ElementId[] = [];
    const processed = new Set<ElementId>();

    for (const id of genElements) {
      if (processed.has(id)) continue;

      // Check if part of a couple
      let foundCouple = false;
      for (const unit of familyUnits.values()) {
        if ((unit.husband === id || unit.wife === id) && unit.husband && unit.wife) {
          const gen1 = generations.get(unit.husband);
          const gen2 = generations.get(unit.wife);

          // Only if both spouses are in same generation
          if (gen1 === gen && gen2 === gen) {
            couples.push([unit.husband, unit.wife]);
            processed.add(unit.husband);
            processed.add(unit.wife);
            foundCouple = true;
            break;
          }
        }
      }

      if (!foundCouple) {
        singles.push(id);
        processed.add(id);
      }
    }

    // Calculate total width needed
    const coupleWidth = (options.nodeWidth * 2) + options.coupleGap;
    const singleWidth = options.nodeWidth;
    const totalWidth =
      (couples.length * coupleWidth) +
      (singles.length * singleWidth) +
      ((couples.length + singles.length - 1) * options.siblingGap);

    // Start X position (centered)
    let currentX = -totalWidth / 2;

    // Position couples
    for (const [husband, wife] of couples) {
      const el1 = elementMap.get(husband);
      const el2 = elementMap.get(wife);

      if (el1) {
        el1.position = { x: currentX, y };
      }

      if (el2) {
        el2.position = { x: currentX + options.nodeWidth + options.coupleGap, y };
      }

      // Store couple position for child centering
      const familyId = findFamilyId(husband, wife, familyUnits);
      if (familyId) {
        couplePositions.set(familyId, {
          x: currentX + (options.nodeWidth + options.coupleGap / 2),
          width: coupleWidth,
        });
      }

      currentX += coupleWidth + options.siblingGap;
    }

    // Position singles
    for (const id of singles) {
      const el = elementMap.get(id);
      if (el) {
        el.position = { x: currentX + options.nodeWidth / 2, y };
      }
      currentX += singleWidth + options.siblingGap;
    }
  }

  // Second pass: center children under parents
  centerChildrenUnderParents(elements, familyUnits, generations, couplePositions, options);
}

/**
 * Find family ID for a couple
 */
function findFamilyId(
  husband: ElementId,
  wife: ElementId,
  familyUnits: Map<string, FamilyUnit>
): string | null {
  for (const [id, unit] of familyUnits) {
    if (unit.husband === husband && unit.wife === wife) {
      return id;
    }
  }
  return null;
}

/**
 * Center children under their parents
 * Only centers "leaf" children (those who are not parents themselves)
 * This preserves couple positioning for intermediate generations
 */
function centerChildrenUnderParents(
  elements: Partial<Element>[],
  familyUnits: Map<string, FamilyUnit>,
  _generations: Map<ElementId, number>,
  couplePositions: Map<string, { x: number; width: number }>,
  options: LayoutOptions
): void {
  const elementMap = new Map<ElementId, Partial<Element>>();
  for (const el of elements) {
    if (el.id) {
      elementMap.set(el.id as ElementId, el);
    }
  }

  // Find all elements that are parents (have children)
  const isParent = new Set<ElementId>();
  for (const unit of familyUnits.values()) {
    if (unit.children.length > 0) {
      if (unit.husband) isParent.add(unit.husband);
      if (unit.wife) isParent.add(unit.wife);
    }
  }

  // Group children by family and calculate offsets
  // Only center children who are NOT parents themselves (leaf nodes)
  for (const [familyId, unit] of familyUnits) {
    if (unit.children.length === 0) continue;

    const couplePos = couplePositions.get(familyId);
    if (!couplePos) continue;

    // Filter to only leaf children (not parents themselves)
    const leafChildren = unit.children.filter(childId => !isParent.has(childId));
    if (leafChildren.length === 0) continue;

    // Calculate children positions centered under parents
    const childCount = leafChildren.length;
    const totalChildrenWidth =
      (childCount * options.nodeWidth) +
      ((childCount - 1) * options.siblingGap);

    const startX = couplePos.x - totalChildrenWidth / 2;

    for (let i = 0; i < leafChildren.length; i++) {
      const childId = leafChildren[i];
      const childEl = elementMap.get(childId);

      if (childEl && childEl.position) {
        // Update X to center under parents, keep Y
        childEl.position = {
          x: startX + (i * (options.nodeWidth + options.siblingGap)) + options.nodeWidth / 2,
          y: childEl.position.y,
        };
      }
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
      maxX = Math.max(maxX, el.position.x + 180); // Approximate node width
      maxY = Math.max(maxY, el.position.y + 60);  // Approximate node height
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

/**
 * Whether the ids React Flow reports as selected are exactly the rendered
 * part of the selection in the store. React Flow only knows what it renders
 * (edges off screen are not), so a selection made elsewhere comes back
 * truncated: writing that echo back would drop the rest of the selection.
 */
export function isRenderedPartOf(
  reportedIds: readonly string[],
  storeSelected: ReadonlySet<string>,
  renderedIds: ReadonlySet<string>,
): boolean {
  let renderedSelected = 0;
  for (const id of storeSelected) if (renderedIds.has(id)) renderedSelected++;
  return reportedIds.length === renderedSelected && reportedIds.every((id) => storeSelected.has(id));
}

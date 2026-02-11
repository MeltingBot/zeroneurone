---
title: "Elements and Links"
weight: 1
---

# Elements and Links

**Elements** and **links** are the fundamental building blocks of your analysis in ZeroNeurone.

## Elements

An element represents any concept: person, place, organization, object, event, document...

### Create an Element

**Double-click** on the canvas to create a new element at that location.


### Element Properties

| Property | Description |
|----------|-------------|
| **Label** | Name displayed on the canvas |
| **Notes** | Free-form description, long text |
| **Tags** | Labels for categorization |
| **Confidence** | Certainty level (0-100%) |
| **Source** | Information origin |
| **Date** | Associated date (for timeline) |
| **Geolocation** | Coordinates (for map) |
| **Properties** | Custom fields (key/value) |

### Visual Appearance

Customize the appearance of each element:

| Option | Values |
|--------|--------|
| **Color** | Palette of 12 colors |
| **Shape** | Circle, square, diamond, hexagon |
| **Size** | Small, medium, large |
| **Text size** | XS (8px), S (12px), M (14px), L (18px), XL (22px) |

### Position Lock

Prevent accidental moves by locking an element's position.

**Lock/Unlock:**
- **Context menu** (right-click) → Lock/Unlock position
- **Detail panel** → Appearance section → Lock button

**Behavior:**
- A locked element cannot be moved
- With multi-selection, lock/unlock applies to all selected elements
- When moving a group, locked elements stay in place

### Events

Elements can have associated **events**, each with a date, description, and optionally a geolocation.

### Extract an Event to Element

Turn an event into a standalone element on the canvas:

1. Hover over the event in the detail panel
2. Click the **↗** icon (Extract to element)
3. A new element is created with the event name, linked to the source element
4. Event dates are carried by the **link** (the temporal relationship)

This operation is undoable with **Ctrl+Z**.

---

## Links

A link represents a relationship between two elements. Links are **first-class citizens**: they have their own metadata, not just a line between two points.

### Create a Link

1. **Drag** from one element to another element
2. The link is created with a default label


### Create a Linked Element

**Drag** from an element to empty space to simultaneously create a new element and the link connecting them.


### Link Properties

| Property | Description |
|----------|-------------|
| **Label** | Relationship type (e.g., "knows", "works for") |
| **Notes** | Detailed description |
| **Confidence** | Certainty level |
| **Source** | Information origin |
| **Period** | Start and end date (for timeline) |
| **Directed** | Arrow indicating direction |
| **Properties** | Custom fields |

### Link Appearance

| Option | Values |
|--------|--------|
| **Color** | Color palette |
| **Style** | Solid, dotted, dashed |
| **Thickness** | Thin, normal, thick |
| **Text size** | XS (8px), S (12px), M (14px), L (18px), XL (22px) |


---

## Multiple Selection

### Selection Rectangle

Click-drag on the canvas background to draw a selection rectangle.

### Add to Selection

**Ctrl+click** to add or remove an element from the selection.

### Batch Operations

With multiple elements selected:

- Apply tags to all
- Change color/shape of all
- Change text size of all
- Delete all
- Move as a group


---

## Groups

Organize your elements into visual **groups**.

### Create a Group

1. Select multiple elements
2. Right-click → **Group**

The group appears as a frame containing its members.


### Manipulate a Group

- **Click on the group**: selects the entire group
- **Double-click**: enter the group to edit members
- **Drag an element** in/out of the group to change membership

---

**See also**: [Tags and properties]({{< relref "tags-properties" >}})

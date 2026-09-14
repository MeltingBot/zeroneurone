---
title: "Tags and Properties"
weight: 2
---

# Tags and Properties

Enrich your elements and links with **tags** for categorization and **properties** for structured data.

## Tags

Tags are free-form labels to categorize your elements and links.

### Add Tags

1. Select an element or link
2. In the detail panel, **Tags** section
3. Type a new tag or select an existing one


### Suggested Tags

ZeroNeurone suggests tags already used in the dossier to maintain consistency.

### Rename a Tag

Rename a tag everywhere in the current dossier:

1. In the detail panel, hover over the tag and click the **pencil** icon (or double-click the name)
2. Type the new name, confirm with **Enter** (Escape to cancel)

The rename applies to **every element and link of the current dossier** carrying that tag, as well as the suggestion list. If the tag matches a tag set, its appearance (icon, color, shape) is carried over under the new name. Other dossiers are not affected.

### Filter by Tags

Use the **Filters** panel to display only elements with certain tags.


### Tag Sets

Tag sets are predefined templates that associate each tag with a default appearance and suggested properties.

**Access the manager**: Menu **⋯** → **Settings** → **Tag Sets**

Each tag set defines:

| Attribute | Description |
|-----------|-------------|
| **Name** | Unique tag name |
| **Description** | Concept description |
| **Color** | Default color applied to the element |
| **Shape** | Default shape (circle, square, diamond, rectangle, hexagon) |
| **Icon** | Associated icon |
| **Suggested properties** | List of pre-typed properties offered when the tag is applied |

When you apply a tag from a set to an element, its appearance (color, shape) is automatically defined and the suggested properties are offered.

**Import/Export**: Tag sets can be exported and imported in JSON or CSV format for sharing between dossiers. Referenced custom icons are embedded in the JSON. Tag sets used in a dossier are also included in the dossier export (ZIP/JSON) and recreated on import when they do not already exist.

### Custom Icons (SVG)

In addition to the built-in icons (Lucide), you can import your own SVG icons — for instance service logos (GitHub, Discord…) downloaded from [Simple Icons](https://simpleicons.org):

1. Open the icon picker (tag set, or a tag's icon in the detail panel)
2. In the **My icons** section, click the import button and choose an `.svg` file (64 KB max)
3. The icon is sanitized (scripts and external references stripped), converted to monochrome, and automatically follows the theme color

Imported icons are global (available in every dossier) and travel with dossier and tag set exports. To delete one, hover over it in the picker and click the trash icon.

> **Licensing**: ZeroNeurone does not bundle any brand logo. If you import a service's logo, its use is your responsibility (trademark law).

**Built-in sets**: ZeroNeurone provides default tag sets (Person, Company, Bank Account, Location…). They cannot be deleted but can be modified. The **Reset** button restores the default sets.

### Tag Display on Canvas

In the **Views** panel, configure tag display:

| Option | Description |
|--------|-------------|
| **None** | Tags hidden |
| **First** | Show only the first tag |
| **All** | Show all tags |

---

## Custom Properties

Properties allow you to add structured data to your elements and links.

### Property Types

| Type | Usage |
|------|-------|
| **Text** | Free string |
| **Number** | Numeric value |
| **Date** | Date with picker |
| **Boolean** | Yes/No |
| **URL** | Clickable link |
| **Email** | Email address |
| **Phone** | Phone number |
| **Datetime** | Date and time with picker |
| **Choice** | Dropdown with predefined options |
| **Geo** | Geographic coordinates (point or polygon) |
| **Country** | Country selector (with flag) |
| **Link** | Reference to another element in the dossier |

### Add a Property

1. Select an element
2. **Properties** section in the detail panel
3. Click **+ Add property**
4. Choose the type and enter the value


### Predefined Properties

Create property templates to speed up data entry:

1. Menu **⋯** → **Settings** → **Properties**
2. Define your properties with name, type, and default values


### Display Properties on Canvas

1. **Views** panel → **Property display**
2. Check the properties to display as badges


### Extract a Property to Element

Turn a property into a standalone element on the canvas:

1. Hover over the property in the detail panel
2. Click the **↗** icon (Extract to element)
3. A new element is created with the property name, linked to the source element

This operation is undoable with **Ctrl+Z**.

---

## Confidence and Source

### Confidence Level

Each element and link can have a confidence level (0-100%).


| Level | Suggested Meaning |
|-------|-------------------|
| 0-25% | Rumor, unverified |
| 25-50% | Single source, needs confirmation |
| 50-75% | Multiple sources |
| 75-100% | Verified, documented |

### Visual Indicator

Enable the confidence indicator in **Views** to see the level directly on the canvas (colored border).


### Source

Document the origin of each piece of information:

- Reference document
- Testimony
- Database
- Direct observation

---

## Dates and Periods

### Simple Date

For elements: a single date (point-in-time event).

### Period (links)

For links: start date and optional end date.


These dates are used by the **Timeline** for chronological visualization.

---

**See also**: [Filters and views]({{< relref "filters-views" >}})

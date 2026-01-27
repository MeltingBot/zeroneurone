---
title: "Map View"
weight: 5
---

# Map View

Visualize your geolocated elements on an interactive map.


## Activate Map View

| Method | Action |
|--------|--------|
| Key **2** | Map mode |
| View button | Click on the map icon |

---

## Geolocate an Element

### From the Detail Panel

1. Select an element
2. **Location** section
3. Click to open the position picker
4. Search for an address or click on the map to place the marker
5. Confirm the position

The marker is draggable: drag it to adjust the position.

---

## Map Interactions

### Navigation

| Action | Result |
|--------|--------|
| **Drag** | Move the map |
| **Wheel** | Zoom |
| **Double-click** | Zoom in |

### Selection

| Action | Result |
|--------|--------|
| **Click marker** | Selects the element |
| **Drag marker** | Moves the element's position |

---

## Marker Appearance

Markers reflect the appearance of elements:

| Property | Map Display |
|----------|-------------|
| **Color** | Marker color |
| **Image** | Thumbnail if element has an attachment |
| **Selection** | Accented border |

### Clusters

Nearby markers are automatically grouped. Click on a cluster to zoom and see individual markers.

---

## Links on Map

Links between geolocated elements are displayed as lines on the map.

- Links retain their color and style (solid, dotted)
- Directed links display an arrow
- Click on a link to select it

---

## Temporal Mode

If your elements have dates or events with positions, enable **temporal mode**:

1. Click **Temporal** in the toolbar
2. Use the slider to navigate through time
3. Markers appear/disappear according to their activity period

Controls:
- **Play**: automatic animation
- **Step**: advance/go back one event

---

## Toolbar

| Button | Action |
|--------|--------|
| **Temporal** | Enable/disable temporal mode |
| **Selection** | Zoom to selected elements |
| **Fit** | Adjust view to see all markers |

---

## Map Export

### GeoJSON Export

Menu **...** → **Export** → **GeoJSON**

Exports geolocated elements in a GIS-compatible format (QGIS, ArcGIS).

### Export Content

| Element | GeoJSON Format |
|---------|----------------|
| Geolocated elements | Point |
| Links (if both ends geolocated) | LineString |

---

**See also**: [Timeline]({{< relref "timeline" >}})

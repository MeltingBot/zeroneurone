---
title: "Map View"
weight: 5
---

# Map View

Visualize your geolocated elements on an interactive 3D map.

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
| **Right-click + drag** | Pitch (tilt) and rotation |

### Selection

| Action | Result |
|--------|--------|
| **Click marker** | Selects the element |
| **Drag marker** | Moves the element's position |

---

## Place Search

The search field in the toolbar lets you locate a place on the map:

1. Type a place name or address
2. Press **Enter** or click the search icon
3. The map flies to the result with a temporary marker (8 seconds)

Search uses Nominatim (OpenStreetMap) and respects the interface language.

---

## 3D Mode

The map uses MapLibre GL JS with WebGL rendering. 3D mode is enabled by default.

### Globe

At maximum zoom-out, the map transforms into a 3D globe. The transition to classic Mercator projection is automatic when zooming in.

### 3D Terrain

Elevation data provides real terrain relief. Mountains, valleys and plains are visible when tilting the map.

### 3D Buildings

From zoom level 14, buildings are displayed as 3D volumes with their real height. Toggle this with the **Buildings** button in the toolbar.

### 3D Toggle

The **3D** button in the toolbar switches between:
- **3D mode**: globe, terrain relief, 45° pitch
- **2D mode**: classic flat map (Mercator projection)

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

## Geographic Zones

Zones let you define areas on the map (surveillance perimeters, areas of interest, intervention sectors…).

### Create a Zone

The **Zone** button in the toolbar offers three shapes via a dropdown menu:

| Shape | Drawing |
|-------|---------|
| **Polygon** | Click to place each vertex, double-click or click on the first point to close |
| **Circle** | 1st click = center, move the mouse to adjust radius (displayed in real time), 2nd click = confirm |
| **Square** | 1st click = center, move the mouse to adjust size, 2nd click = confirm |

Press **Escape** to cancel drawing.

A Zone element is created with **Area** and **Radius** (for circles) properties.

### Edit a Zone

Double-click on a zone to enter edit mode:

| Type | Edit Mode |
|------|-----------|
| **Polygon / Square** | Drag vertices to move them. Click on midpoints to add a vertex. |
| **Circle** | Four cardinal handles (N, E, S, W) allow resizing the radius by dragging. |

Click outside the zone to save. Press **Escape** to cancel.

### Move a Zone

Drag the zone's central marker to move it. The shape (polygon, circle, square) is preserved.

### Edit GeoJSON

For events with zones, a text editor allows copy/pasting GeoJSON from an external tool (QGIS, geojson.io…). Accepted formats: `Polygon` (Geometry, Feature or FeatureCollection).

---

## Base Maps

Four base maps are available via the selector in the toolbar:

| Base Map | Description |
|----------|-------------|
| **OpenStreetMap** | Standard map with local names |
| **OSM Latin** | Place names in Latin script (default) |
| **CartoDB** | Clean, minimal map (auto-switches to dark mode) |
| **Satellite** | Satellite imagery (Esri) |

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
| **Search** | Search for a place (Nominatim) |
| **Base map** | Choose between 4 base maps |
| **3D** | Enable/disable 3D mode |
| **Buildings** | Show/hide 3D buildings |
| **Temporal** | Enable/disable temporal mode |
| **Selection** | Zoom to selected elements |
| **Zone** | Draw a zone (polygon, circle or square) |
| **Fit** | Adjust view to see all markers |
| **Export CSV** | Export map data as CSV |

---

## Exports

### CSV Export

Click the download icon in the toolbar to export geolocated elements as CSV.

### GeoJSON Export

Menu **...** → **Export** → **GeoJSON**

Exports geolocated elements in a GIS-compatible format (QGIS, ArcGIS).

### Export Content

| Element | GeoJSON Format |
|---------|----------------|
| Geolocated elements | Point |
| Geographic zones | Polygon |
| Links (if both ends geolocated) | LineString |

---

**See also**: [Timeline]({{< relref "timeline" >}})

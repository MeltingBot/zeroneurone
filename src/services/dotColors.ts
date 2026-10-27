/**
 * Graphviz colours → #rrggbb.
 *
 * Graphviz reads X11 colour names (its default scheme), "#rrggbb[aa]",
 * HSV triples ("0.6 0.4 1.0") and colour lists ("red:blue", the first one
 * fills). X11 names are the CSS ones, with a few different values (gray,
 * green, maroon, purple) and numbered shades (lightblue1…4), read here as
 * their base colour.
 */

const NAMES =
  'aliceblue:f0f8ff antiquewhite:faebd7 aqua:00ffff aquamarine:7fffd4 azure:f0ffff beige:f5f5dc bisque:ffe4c4 ' +
  'black:000000 blanchedalmond:ffebcd blue:0000ff blueviolet:8a2be2 brown:a52a2a burlywood:deb887 cadetblue:5f9ea0 ' +
  'chartreuse:7fff00 chocolate:d2691e coral:ff7f50 cornflowerblue:6495ed cornsilk:fff8dc crimson:dc143c cyan:00ffff ' +
  'darkblue:00008b darkcyan:008b8b darkgoldenrod:b8860b darkgray:a9a9a9 darkgreen:006400 darkgrey:a9a9a9 ' +
  'darkkhaki:bdb76b darkmagenta:8b008b darkolivegreen:556b2f darkorange:ff8c00 darkorchid:9932cc darkred:8b0000 ' +
  'darksalmon:e9967a darkseagreen:8fbc8f darkslateblue:483d8b darkslategray:2f4f4f darkslategrey:2f4f4f ' +
  'darkturquoise:00ced1 darkviolet:9400d3 deeppink:ff1493 deepskyblue:00bfff dimgray:696969 dimgrey:696969 ' +
  'dodgerblue:1e90ff firebrick:b22222 floralwhite:fffaf0 forestgreen:228b22 fuchsia:ff00ff gainsboro:dcdcdc ' +
  'ghostwhite:f8f8ff gold:ffd700 goldenrod:daa520 gray:c0c0c0 grey:c0c0c0 green:00ff00 greenyellow:adff2f ' +
  'honeydew:f0fff0 hotpink:ff69b4 indianred:cd5c5c indigo:4b0082 ivory:fffff0 khaki:f0e68c lavender:e6e6fa ' +
  'lavenderblush:fff0f5 lawngreen:7cfc00 lemonchiffon:fffacd lightblue:add8e6 lightcoral:f08080 lightcyan:e0ffff ' +
  'lightgoldenrod:eedd82 lightgoldenrodyellow:fafad2 lightgray:d3d3d3 lightgreen:90ee90 lightgrey:d3d3d3 ' +
  'lightpink:ffb6c1 lightsalmon:ffa07a lightseagreen:20b2aa lightskyblue:87cefa lightslateblue:8470ff ' +
  'lightslategray:778899 lightslategrey:778899 lightsteelblue:b0c4de lightyellow:ffffe0 lime:00ff00 ' +
  'limegreen:32cd32 linen:faf0e6 magenta:ff00ff maroon:b03060 mediumaquamarine:66cdaa mediumblue:0000cd ' +
  'mediumorchid:ba55d3 mediumpurple:9370db mediumseagreen:3cb371 mediumslateblue:7b68ee mediumspringgreen:00fa9a ' +
  'mediumturquoise:48d1cc mediumvioletred:c71585 midnightblue:191970 mintcream:f5fffa mistyrose:ffe4e1 ' +
  'moccasin:ffe4b5 navajowhite:ffdead navy:000080 navyblue:000080 oldlace:fdf5e6 olive:808000 olivedrab:6b8e23 ' +
  'orange:ffa500 orangered:ff4500 orchid:da70d6 palegoldenrod:eee8aa palegreen:98fb98 paleturquoise:afeeee ' +
  'palevioletred:db7093 papayawhip:ffefd5 peachpuff:ffdab9 peru:cd853f pink:ffc0cb plum:dda0dd ' +
  'powderblue:b0e0e6 purple:a020f0 rebeccapurple:663399 red:ff0000 rosybrown:bc8f8f royalblue:4169e1 ' +
  'saddlebrown:8b4513 salmon:fa8072 sandybrown:f4a460 seagreen:2e8b57 seashell:fff5ee sienna:a0522d ' +
  'silver:c0c0c0 skyblue:87ceeb slateblue:6a5acd slategray:708090 slategrey:708090 snow:fffafa ' +
  'springgreen:00ff7f steelblue:4682b4 tan:d2b48c teal:008080 thistle:d8bfd8 tomato:ff6347 turquoise:40e0d0 ' +
  'violet:ee82ee violetred:d02090 webgray:808080 webgreen:008000 webmaroon:800000 webpurple:800080 ' +
  'wheat:f5deb3 white:ffffff whitesmoke:f5f5f5 yellow:ffff00 yellowgreen:9acd32';

const NAMED = new Map<string, string>(
  NAMES.split(' ').map((pair) => {
    const [name, hex] = pair.split(':');
    return [name, `#${hex}`];
  }),
);

function hsvToHex(h: number, s: number, v: number): string {
  const i = Math.floor(h * 6) % 6;
  const f = h * 6 - Math.floor(h * 6);
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  const [r, g, b] = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i];
  const hex = (x: number) => Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/** #rrggbb for a Graphviz colour, or undefined (transparent, unknown name, brewer scheme…). */
export function parseDotColor(value: string | undefined): string | undefined {
  if (!value) return undefined;
  // A colour list fills with its first colour ("red;0.3:blue")
  const first = value.split(':')[0].split(';')[0].trim();
  if (!first) return undefined;
  if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(first)) return first.slice(0, 7).toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(first)) return `#${first[1]}${first[1]}${first[2]}${first[2]}${first[3]}${first[3]}`.toLowerCase();
  const hsv = first.split(/[\s,]+/).map(Number);
  if (hsv.length === 3 && hsv.every((n) => Number.isFinite(n) && n >= 0 && n <= 1)) {
    return hsvToHex(hsv[0], hsv[1], hsv[2]);
  }
  // "/x11/red", "lightblue3"
  const name = first.replace(/^\/[^/]*\//, '').toLowerCase().replace(/\s+/g, '');
  return NAMED.get(name) ?? NAMED.get(name.replace(/[1-4]$/, ''));
}

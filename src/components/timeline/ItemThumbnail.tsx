/** Thumbnail of the element an item comes from: its image, or a coloured letter in its shape */

// Thumbnail component showing element image or shape with color
export function ItemThumbnail({ imageUrl, shape, color, letter, blur, size }: {
  imageUrl?: string;
  shape: 'circle' | 'square' | 'diamond' | 'rectangle' | 'hexagon';
  color: string;
  letter: string;
  blur?: boolean;
  size?: number; // Custom size in pixels
}) {
  const sizeStyle = size ? { width: size, height: size } : undefined;

  // If we have an image, show it (blurred if hideMedia)
  if (imageUrl) {
    return (
      <div
        className={`${size ? '' : 'w-7 h-7'} rounded shrink-0 bg-cover bg-center border border-border-default overflow-hidden`}
        style={{
          ...sizeStyle,
          backgroundImage: `url(${imageUrl})`,
          filter: blur ? 'blur(8px)' : undefined,
        }}
      />
    );
  }

  // Otherwise show shape with letter
  const baseClasses = `${size ? '' : 'w-6 h-6'} flex items-center justify-center font-bold text-white shrink-0 border border-white/30`;
  const fontSize = size ? Math.max(10, size * 0.35) : 10;

  const shapeClasses: Record<string, string> = {
    circle: 'rounded-full',
    square: 'rounded-sm',
    diamond: 'rounded-sm rotate-45',
    rectangle: 'rounded-sm',
    hexagon: 'sketchy-hexagon',
  };

  return (
    <div
      className={`${baseClasses} ${shapeClasses[shape] || 'rounded-full'}`}
      style={{
        ...sizeStyle,
        backgroundColor: color,
        fontSize: `${fontSize}px`,
      }}
    >
      <span className={shape === 'diamond' ? '-rotate-45' : ''}>
        {letter}
      </span>
    </div>
  );
}

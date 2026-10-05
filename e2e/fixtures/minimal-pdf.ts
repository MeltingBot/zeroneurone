/**
 * A minimal, valid PDF, written by hand: 200x200 pages, the first printing
 * "ZeroNeurone", the others "Page N" and, below, "suite N".
 *
 * Small enough to keep in the repository and independent of any generator, so
 * the preview test does not depend on an external fixture file.
 */
export function buildMinimalPdf(pageCount = 1): Buffer {
  // Objects 1-3 are fixed; each page then takes two: the page and its content.
  const pageId = (i: number) => 4 + 2 * i;
  const kids = Array.from({ length: pageCount }, (_, i) => `${pageId(i)} 0 R`).join(' ');
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    `2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>\nendobj\n`,
    '3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ];
  for (let i = 0; i < pageCount; i++) {
    // Later pages add a second, smaller run lower down, so a page holds more
    // than one text item.
    const content = i === 0
      ? 'BT /F1 18 Tf 20 100 Td (ZeroNeurone) Tj ET'
      : `BT /F1 18 Tf 20 100 Td (Page ${i + 1}) Tj ET BT /F1 12 Tf 20 40 Td (suite ${i + 1}) Tj ET`;
    objects.push(
      `${pageId(i)} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] ` +
        `/Resources << /Font << /F1 3 0 R >> >> /Contents ${pageId(i) + 1} 0 R >>\nendobj\n`,
      `${pageId(i) + 1} 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`,
    );
  }

  return serialize(objects);
}

/**
 * An A4 page with three paragraphs of five lines ("Premier ligne 1 du
 * paragraphe avec des mots", …, then "Second …", "Troisieme …"), 11pt with
 * 13pt leading, paragraphs starting at y = 700, 560 and 420 from the bottom,
 * x = 40. Gaps between lines and paragraphs are what text selection trips on.
 */
export function buildParagraphPdf(): Buffer {
  const paragraph = (prefix: string, y: number) => {
    const lines = Array.from({ length: 5 }, (_, i) =>
      `(${prefix} ligne ${i + 1} du paragraphe avec des mots${i === 4 ? '.' : ''}) Tj T*`);
    return `BT /F1 11 Tf 13 TL 40 ${y} Td ${lines.join(' ')} ET`;
  };
  const content = [paragraph('Premier', 700), paragraph('Second', 560), paragraph('Troisieme', 420)].join(' ');
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ' +
      '/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    `5 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`,
  ];
  return serialize(objects);
}

function serialize(objects: string[]): Buffer {
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj;
  }
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

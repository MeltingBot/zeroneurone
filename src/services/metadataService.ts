import type { Property, GeoCoordinates } from '../types';

export interface ExtractedMetadata {
  properties: Property[];
  geo?: GeoCoordinates;
}

// MIME types that support EXIF
const EXIF_MIME_TYPES = ['image/jpeg', 'image/tiff', 'image/webp'];

// Office MIME types (OOXML)
const OFFICE_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];

/**
 * Parse PDF date format D:YYYYMMDDHHmmSS±HH'mm' to Date
 */
function parsePdfDate(raw: string): Date | null {
  if (!raw) return null;
  // Remove "D:" prefix if present
  const s = raw.startsWith('D:') ? raw.slice(2) : raw;
  // Format: YYYYMMDDHHmmSS±HH'mm' (parts after YYYY are optional)
  const match = s.match(
    /^(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?([+-Z])?(\d{2})?'?(\d{2})?'?$/
  );
  if (!match) return null;

  const [, year, month, day, hour, min, sec, tzSign, tzHour, tzMin] = match;
  const dateStr = `${year}-${month || '01'}-${day || '01'}T${hour || '00'}:${min || '00'}:${sec || '00'}`;

  if (tzSign && tzSign !== 'Z' && tzHour) {
    const offset = `${tzSign}${tzHour}:${tzMin || '00'}`;
    return new Date(dateStr + offset);
  }
  return new Date(dateStr + 'Z');
}

/**
 * Extract metadata from PDF using pdf.js
 */
async function extractPdfMetadata(arrayBuffer: ArrayBuffer): Promise<ExtractedMetadata | null> {
  const pdfjsLib = await import('pdfjs-dist');
  // Ensure worker is configured
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString();
  }

  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const meta = await pdf.getMetadata();
  const info = meta?.info as Record<string, unknown> | undefined;

  const properties: Property[] = [];

  if (info) {
    if (info.Producer && typeof info.Producer === 'string') {
      properties.push({ key: 'Producteur', value: info.Producer, type: 'text' });
    }
    if (info.Creator && typeof info.Creator === 'string') {
      properties.push({ key: 'Créateur', value: info.Creator, type: 'text' });
    }
    if (info.CreationDate && typeof info.CreationDate === 'string') {
      const date = parsePdfDate(info.CreationDate);
      if (date && !isNaN(date.getTime())) {
        properties.push({ key: 'Créé le', value: date, type: 'datetime' });
      }
    }
    if (info.ModDate && typeof info.ModDate === 'string') {
      const date = parsePdfDate(info.ModDate);
      if (date && !isNaN(date.getTime())) {
        properties.push({ key: 'Modifié le', value: date, type: 'datetime' });
      }
    }
    if (info.PDFFormatVersion) {
      properties.push({ key: 'Format PDF', value: String(info.PDFFormatVersion), type: 'text' });
    }
    if (info.IsAcroFormPresent) {
      properties.push({ key: 'Contient des formulaires', value: true, type: 'boolean' });
    }
  }

  properties.push({ key: 'Nombre de pages', value: pdf.numPages, type: 'number' });

  return properties.length > 0 ? { properties } : null;
}

/**
 * Extract EXIF metadata from images using exifr
 */
async function extractExifMetadata(file: File): Promise<ExtractedMetadata | null> {
  const exifr = await import('exifr');

  const data = await exifr.default.parse(file, {
    gps: true,
    exif: true,
    iptc: false,
    xmp: false,
  });

  if (!data) return null;

  const properties: Property[] = [];
  let geo: GeoCoordinates | undefined;

  if (data.Make) {
    properties.push({ key: 'Appareil (fabricant)', value: String(data.Make), type: 'text' });
  }
  if (data.Model) {
    properties.push({ key: 'Appareil (modèle)', value: String(data.Model), type: 'text' });
  }
  if (data.DateTimeOriginal) {
    const date = data.DateTimeOriginal instanceof Date
      ? data.DateTimeOriginal
      : new Date(data.DateTimeOriginal);
    if (!isNaN(date.getTime())) {
      properties.push({ key: 'Date de prise de vue', value: date, type: 'datetime' });
    }
  }
  if (data.ImageWidth && data.ImageHeight) {
    properties.push({ key: 'Dimensions', value: `${data.ImageWidth} x ${data.ImageHeight}`, type: 'text' });
  } else if (data.ExifImageWidth && data.ExifImageHeight) {
    properties.push({ key: 'Dimensions', value: `${data.ExifImageWidth} x ${data.ExifImageHeight}`, type: 'text' });
  }
  if (data.ExposureTime) {
    const exposure = data.ExposureTime < 1
      ? `1/${Math.round(1 / data.ExposureTime)}s`
      : `${data.ExposureTime}s`;
    properties.push({ key: 'Exposition', value: exposure, type: 'text' });
  }
  if (data.FNumber) {
    properties.push({ key: 'Ouverture', value: `f/${data.FNumber}`, type: 'text' });
  }
  if (data.ISO) {
    properties.push({ key: 'ISO', value: Number(data.ISO), type: 'number' });
  }
  if (data.FocalLength) {
    properties.push({ key: 'Focale', value: `${data.FocalLength}mm`, type: 'text' });
  }
  if (data.Software) {
    properties.push({ key: 'Logiciel', value: String(data.Software), type: 'text' });
  }

  // GPS coordinates
  if (data.latitude != null && data.longitude != null) {
    geo = { lat: data.latitude, lng: data.longitude };
  }

  if (properties.length === 0 && !geo) return null;
  return { properties, geo };
}

/**
 * Extract metadata from DOCX/XLSX/PPTX via JSZip (Dublin Core in docProps/)
 */
async function extractOfficeMetadata(arrayBuffer: ArrayBuffer): Promise<ExtractedMetadata | null> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(arrayBuffer);

  const properties: Property[] = [];

  // Parse docProps/core.xml (Dublin Core)
  const coreXml = await zip.file('docProps/core.xml')?.async('text');
  if (coreXml) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(coreXml, 'application/xml');

    const creator = doc.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/', 'creator')[0]?.textContent;
    if (creator) {
      properties.push({ key: 'Auteur', value: creator, type: 'text' });
    }

    const lastModifiedBy = doc.getElementsByTagNameNS('http://schemas.openxmlformats.org/package/2006/metadata/core-properties', 'lastModifiedBy')[0]?.textContent;
    if (lastModifiedBy) {
      properties.push({ key: 'Modifié par', value: lastModifiedBy, type: 'text' });
    }

    const created = doc.getElementsByTagNameNS('http://purl.org/dc/terms/', 'created')[0]?.textContent;
    if (created) {
      const date = new Date(created);
      if (!isNaN(date.getTime())) {
        properties.push({ key: 'Créé le', value: date, type: 'datetime' });
      }
    }

    const modified = doc.getElementsByTagNameNS('http://purl.org/dc/terms/', 'modified')[0]?.textContent;
    if (modified) {
      const date = new Date(modified);
      if (!isNaN(date.getTime())) {
        properties.push({ key: 'Modifié le', value: date, type: 'datetime' });
      }
    }

    const title = doc.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/', 'title')[0]?.textContent;
    if (title) {
      properties.push({ key: 'Titre', value: title, type: 'text' });
    }

    const subject = doc.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/', 'subject')[0]?.textContent;
    if (subject) {
      properties.push({ key: 'Sujet', value: subject, type: 'text' });
    }
  }

  // Parse docProps/app.xml
  const appXml = await zip.file('docProps/app.xml')?.async('text');
  if (appXml) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(appXml, 'application/xml');
    const ns = 'http://schemas.openxmlformats.org/officeDocument/2006/extended-properties';

    const pages = doc.getElementsByTagNameNS(ns, 'Pages')[0]?.textContent;
    if (pages && Number(pages) > 0) {
      properties.push({ key: 'Nombre de pages', value: Number(pages), type: 'number' });
    }

    const words = doc.getElementsByTagNameNS(ns, 'Words')[0]?.textContent;
    if (words && Number(words) > 0) {
      properties.push({ key: 'Nombre de mots', value: Number(words), type: 'number' });
    }

    const application = doc.getElementsByTagNameNS(ns, 'Application')[0]?.textContent;
    if (application) {
      properties.push({ key: 'Application', value: application, type: 'text' });
    }
  }

  return properties.length > 0 ? { properties } : null;
}

/**
 * Main entry point: extract metadata from a file based on its MIME type.
 * Returns null if no metadata found or file type not supported.
 */
async function extractMetadata(file: File, arrayBuffer: ArrayBuffer): Promise<ExtractedMetadata | null> {
  try {
    if (file.type === 'application/pdf') {
      return await extractPdfMetadata(arrayBuffer);
    }

    if (EXIF_MIME_TYPES.includes(file.type)) {
      return await extractExifMetadata(file);
    }

    if (OFFICE_MIME_TYPES.includes(file.type)) {
      return await extractOfficeMetadata(arrayBuffer);
    }

    // Also detect Office files by extension if MIME type is generic
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext && ['docx', 'xlsx', 'pptx'].includes(ext)) {
      return await extractOfficeMetadata(arrayBuffer);
    }

    return null;
  } catch (error) {
    console.error('Metadata extraction error:', error);
    return null;
  }
}

export const metadataService = { extractMetadata };

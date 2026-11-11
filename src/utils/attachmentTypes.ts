/**
 * Files ZN accepts as attachments: the desktop validates every file against
 * these (fileService), on upload and when one arrives from a collaborator;
 * the mobile companion offers and checks the same, so a file it sends is
 * never refused on the other side.
 */

export const ATTACHMENT_LIMITS = {
  // Maximum file size: 100 MB
  MAX_FILE_SIZE: 100 * 1024 * 1024,

  // Allowed MIME types whitelist
  ALLOWED_MIME_TYPES: new Set([
    // Images
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'image/bmp',
    'image/tiff',
    'image/x-icon',

    // Documents
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.oasis.opendocument.text',
    'application/vnd.oasis.opendocument.spreadsheet',
    'application/vnd.oasis.opendocument.presentation',

    // Text files
    'text/plain',
    'text/csv',
    'text/html',
    'text/markdown',
    'text/xml',
    'application/json',
    'application/xml',

    // Emails
    'message/rfc822',

    // Archives (for dossier export/import)
    'application/zip',
    'application/x-zip-compressed',

    // Audio
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/ogg',
    'audio/webm',
    'audio/aac',
    'audio/flac',

    // Video
    'video/mp4',
    'video/webm',
    'video/ogg',
    'video/quicktime',
    'video/x-msvideo',
  ]),

  // Authoritative list: a file is accepted on its extension, never on the
  // declared MIME type alone (see validateFile).
  ALLOWED_EXTENSIONS: new Set([
    // Text
    '.txt', '.md', '.markdown', '.csv', '.json', '.xml', '.html', '.htm',
    // Documents
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.ods', '.odp',
    // Emails
    '.eml',
    // Images
    '.jpg', '.jpeg', '.jpe', '.jfif', '.pjpeg',
    '.png', '.gif', '.webp', '.svg', '.bmp', '.tiff', '.tif', '.ico',
    // Audio
    '.mp3', '.wav', '.ogg', '.oga', '.aac', '.flac', '.m4a',
    // Video
    '.mp4', '.m4v', '.webm', '.ogv', '.mov', '.avi', '.mkv',
    // Archives
    '.zip',
  ]),
};

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot).toLowerCase() : '';
}

/** Same rule as the desktop: the extension decides; a declared type must be known too */
export function isAllowedAttachment(name: string, mimeType: string): boolean {
  if (!ATTACHMENT_LIMITS.ALLOWED_EXTENSIONS.has(extensionOf(name))) return false;
  const declared = mimeType && mimeType !== 'application/octet-stream';
  return !declared || ATTACHMENT_LIMITS.ALLOWED_MIME_TYPES.has(mimeType);
}

/** `accept` value of a file input offering the allowed types */
export const ATTACHMENT_ACCEPT = [...ATTACHMENT_LIMITS.ALLOWED_EXTENSIONS].join(',');

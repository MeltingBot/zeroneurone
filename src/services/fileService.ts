import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { db } from '../db/database';
import { generateUUID, bufferToHex, getExtension } from '../utils';
import type { Asset, AssetId, DossierId } from '../types';
import { useEncryptionStore } from '../stores/encryptionStore';
import { encryptOpfsBuffer, decryptOpfsBuffer, isOpfsEncrypted } from './encryption/opfsEncryption';

// Configure pdf.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

// ============================================================================
// SECURITY LIMITS FOR FILE UPLOADS
// ============================================================================
const FILE_LIMITS = {
  // Maximum file size: 100 MB
  MAX_FILE_SIZE: 100 * 1024 * 1024,

  // Maximum base64 payload size from sync: 150 MB (accounts for base64 overhead)
  MAX_BASE64_SIZE: 150 * 1024 * 1024,

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

  // Additional extensions to allow (when MIME type is empty/generic)
  ALLOWED_EXTENSIONS: new Set([
    // Text
    '.txt', '.md', '.csv', '.json', '.xml', '.html', '.htm',
    // Documents
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.ods', '.odp',
    // Images
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.tiff', '.ico',
    // Audio
    '.mp3', '.wav', '.ogg', '.aac', '.flac', '.m4a',
    // Video
    '.mp4', '.webm', '.mov', '.avi', '.mkv',
    // Archives
    '.zip',
  ]),
};

export class FileValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileValidationError';
  }
}

class FileService {
  private root: FileSystemDirectoryHandle | null = null;
  private initialized = false;

  /** Retourne la DEK si le chiffrement est actif, null sinon */
  private getDek(): Uint8Array | null {
    return useEncryptionStore.getState().dek;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      this.root = await navigator.storage.getDirectory();
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize OPFS:', error);
      throw new Error('OPFS is not supported in this browser');
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Validate a file before saving
   * @throws FileValidationError if file is invalid
   */
  validateFile(file: File): void {
    // Check file size
    if (file.size > FILE_LIMITS.MAX_FILE_SIZE) {
      const maxMB = (FILE_LIMITS.MAX_FILE_SIZE / 1024 / 1024).toFixed(0);
      throw new FileValidationError(`Fichier trop volumineux. Taille max: ${maxMB} Mo`);
    }

    // Check MIME type
    const mimeAllowed = FILE_LIMITS.ALLOWED_MIME_TYPES.has(file.type);

    // Check extension as fallback (for empty or application/octet-stream MIME)
    const ext = '.' + getExtension(file.name).toLowerCase();
    const extAllowed = FILE_LIMITS.ALLOWED_EXTENSIONS.has(ext);

    if (!mimeAllowed && !extAllowed) {
      throw new FileValidationError(
        `Type de fichier non autorise: ${file.type || 'inconnu'} (${ext})`
      );
    }
  }

  /**
   * Validate base64 data from sync before saving
   * @throws FileValidationError if data is invalid
   */
  private validateBase64Data(
    base64Data: string,
    mimeType: string,
    filename: string,
    size: number
  ): void {
    // Check base64 payload size
    if (base64Data.length > FILE_LIMITS.MAX_BASE64_SIZE) {
      throw new FileValidationError('Fichier synchronise trop volumineux');
    }

    // Check declared size
    if (size > FILE_LIMITS.MAX_FILE_SIZE) {
      const maxMB = (FILE_LIMITS.MAX_FILE_SIZE / 1024 / 1024).toFixed(0);
      throw new FileValidationError(`Fichier trop volumineux. Taille max: ${maxMB} Mo`);
    }

    // Check MIME type
    const mimeAllowed = FILE_LIMITS.ALLOWED_MIME_TYPES.has(mimeType);

    // Check extension as fallback
    const ext = '.' + getExtension(filename).toLowerCase();
    const extAllowed = FILE_LIMITS.ALLOWED_EXTENSIONS.has(ext);

    if (!mimeAllowed && !extAllowed) {
      throw new FileValidationError(
        `Type de fichier non autorise: ${mimeType || 'inconnu'} (${ext})`
      );
    }
  }

  async saveAsset(dossierId: DossierId, file: File): Promise<Asset> {
    await this.ensureInitialized();

    // Validate file before processing
    this.validateFile(file);

    // 1. Calculate hash
    const arrayBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hash = bufferToHex(hashBuffer);

    // 2. Check if already exists (deduplication)
    const existing = await db.assets
      .where({ dossierId, hash })
      .first();

    if (existing) {
      // If existing asset has no thumbnail, try to generate one now
      if (!existing.thumbnailDataUrl) {
        const thumbnailDataUrl = await this.generateThumbnail(file, arrayBuffer);
        if (thumbnailDataUrl) {
          await db.assets.update(existing.id, { thumbnailDataUrl });
          existing.thumbnailDataUrl = thumbnailDataUrl;
        }
      }
      return existing;
    }

    // 3. Create OPFS path
    const dirHandle = await this.getAssetDirectory(dossierId);
    const extension = getExtension(file.name);
    const filename = `${hash}.${extension}`;

    // 4. Write file (chiffré si DEK disponible)
    const dek = this.getDek();
    const bufferToWrite = dek
      ? await encryptOpfsBuffer(dek, arrayBuffer)
      : arrayBuffer;
    const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(bufferToWrite);
    await writable.close();

    // 5. Generate thumbnail if image or PDF
    const thumbnailDataUrl = await this.generateThumbnail(file, arrayBuffer);

    // 6. Extract text if possible
    const extractedText = await this.extractText(file, arrayBuffer);

    // 7. Create Asset entry
    const asset: Asset = {
      id: generateUUID(),
      dossierId,
      filename: file.name,
      mimeType: file.type,
      size: file.size,
      hash,
      opfsPath: `dossiers/${dossierId}/assets/${filename}`,
      thumbnailDataUrl,
      extractedText,
      createdAt: new Date(),
    };

    await db.assets.add(asset);
    return asset;
  }

  async getAssetFile(asset: Asset): Promise<File> {
    await this.ensureInitialized();

    const pathParts = asset.opfsPath.split('/');
    let handle: FileSystemDirectoryHandle = this.root!;

    for (const part of pathParts.slice(0, -1)) {
      handle = await handle.getDirectoryHandle(part);
    }

    const fileHandle = await handle.getFileHandle(pathParts.at(-1)!);
    const rawFile = await fileHandle.getFile();

    // Déchiffrer si le fichier est chiffré (magic header présent)
    const dek = this.getDek();
    if (dek) {
      const rawBuf = await rawFile.arrayBuffer();
      if (isOpfsEncrypted(rawBuf)) {
        const plainBuf = await decryptOpfsBuffer(dek, rawBuf);
        return new File([plainBuf], rawFile.name, { type: asset.mimeType });
      }
    }

    return rawFile;
  }

  async getAssetUrl(asset: Asset): Promise<string> {
    const file = await this.getAssetFile(asset);
    return URL.createObjectURL(file);
  }

  async deleteAsset(asset: Asset): Promise<void> {
    await this.ensureInitialized();

    try {
      // Delete OPFS file
      const pathParts = asset.opfsPath.split('/');
      let handle: FileSystemDirectoryHandle = this.root!;

      for (const part of pathParts.slice(0, -1)) {
        handle = await handle.getDirectoryHandle(part);
      }

      await handle.removeEntry(pathParts.at(-1)!);
    } catch (error) {
      console.warn('Failed to delete file from OPFS:', error);
    }

    // Delete DB entry
    await db.assets.delete(asset.id);
  }

  async deleteDossierAssets(dossierId: DossierId): Promise<void> {
    await this.ensureInitialized();

    try {
      const dossiers = await this.root!.getDirectoryHandle('dossiers');
      await dossiers.removeEntry(dossierId, { recursive: true });
    } catch (error) {
      console.warn('Failed to delete dossier directory:', error);
    }

    await db.assets.where({ dossierId }).delete();
  }

  async getAssetsByDossier(dossierId: DossierId): Promise<Asset[]> {
    return db.assets.where({ dossierId }).toArray();
  }

  async getAssetById(id: AssetId): Promise<Asset | undefined> {
    return db.assets.get(id);
  }

  /**
   * Save an asset from base64 data (used for receiving assets from peers via sync)
   * Returns null if asset already exists locally
   */
  async saveAssetFromBase64(
    assetData: {
      id: string;
      dossierId: DossierId;
      filename: string;
      mimeType: string;
      size: number;
      hash: string;
      thumbnailDataUrl: string | null;
      extractedText: string | null;
      createdAt: Date;
    },
    base64Data: string
  ): Promise<Asset | null> {
    await this.ensureInitialized();

    // Validate before processing (security check for synced files)
    this.validateBase64Data(base64Data, assetData.mimeType, assetData.filename, assetData.size);

    // Check if already exists locally (by hash for deduplication)
    const existing = await db.assets
      .where({ dossierId: assetData.dossierId, hash: assetData.hash })
      .first();

    if (existing) {
      return null; // Already have this file
    }

    // Decode base64 to ArrayBuffer
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const arrayBuffer = bytes.buffer;

    // Create OPFS path and write file (chiffré si DEK disponible)
    const dirHandle = await this.getAssetDirectory(assetData.dossierId);
    const extension = getExtension(assetData.filename);
    const filename = `${assetData.hash}.${extension}`;

    const dek2 = this.getDek();
    const bufToWrite = dek2
      ? await encryptOpfsBuffer(dek2, arrayBuffer)
      : arrayBuffer;
    const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(bufToWrite);
    await writable.close();

    // Create Asset entry
    const asset: Asset = {
      id: assetData.id,
      dossierId: assetData.dossierId,
      filename: assetData.filename,
      mimeType: assetData.mimeType,
      size: assetData.size,
      hash: assetData.hash,
      opfsPath: `dossiers/${assetData.dossierId}/assets/${filename}`,
      thumbnailDataUrl: assetData.thumbnailDataUrl,
      extractedText: assetData.extractedText,
      createdAt: assetData.createdAt,
    };

    // Use put() instead of add() to handle potential duplicate IDs from sync
    await db.assets.put(asset);
    return asset;
  }

  private async getAssetDirectory(
    dossierId: DossierId
  ): Promise<FileSystemDirectoryHandle> {
    const dossiers = await this.root!.getDirectoryHandle('dossiers', {
      create: true,
    });
    const dossier = await dossiers.getDirectoryHandle(dossierId, {
      create: true,
    });
    return dossier.getDirectoryHandle('assets', { create: true });
  }

  private async generateThumbnail(file: File, arrayBuffer: ArrayBuffer): Promise<string | null> {
    // Handle images
    if (file.type.startsWith('image/')) {
      return this.generateImageThumbnail(file);
    }

    // Handle PDFs
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      return this.generatePdfThumbnail(arrayBuffer);
    }

    return null;
  }

  private async generateImageThumbnail(file: File): Promise<string | null> {
    try {
      const img = new Image();
      const url = URL.createObjectURL(file);

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = url;
      });

      URL.revokeObjectURL(url);

      // Create thumbnail (max 200x200)
      const maxSize = 200;
      const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
      const width = Math.round(img.width * scale);
      const height = Math.round(img.height * scale);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      ctx.drawImage(img, 0, 0, width, height);

      return canvas.toDataURL('image/jpeg', 0.7);
    } catch (error) {
      console.warn('Failed to generate image thumbnail:', error);
      return null;
    }
  }

  private async generatePdfThumbnail(arrayBuffer: ArrayBuffer): Promise<string | null> {
    try {
      // Use a copy: getDocument() transfers the ArrayBuffer to the worker,
      // which would detach the original and break subsequent extractPdfText()
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer.slice(0) });
      const pdf = await loadingTask.promise;

      const page = await pdf.getPage(1);

      const viewport = page.getViewport({ scale: 1 });
      const maxSize = 200;
      const scale = Math.min(maxSize / viewport.width, maxSize / viewport.height);
      const scaledViewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.round(scaledViewport.width);
      canvas.height = Math.round(scaledViewport.height);

      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({
        canvasContext: ctx,
        viewport: scaledViewport,
        canvas: canvas,
      }).promise;

      return canvas.toDataURL('image/jpeg', 0.8);
    } catch (error) {
      console.warn('Failed to generate PDF thumbnail:', error);
      return null;
    }
  }

  private async extractText(file: File, arrayBuffer: ArrayBuffer): Promise<string | null> {
    // Extract text from text files
    if (file.type.startsWith('text/') || file.name.endsWith('.md') || file.name.endsWith('.txt')) {
      try {
        return await file.text();
      } catch {
        return null;
      }
    }

    // Extract text from PDFs
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      return this.extractPdfText(arrayBuffer);
    }

    return null;
  }

  private async extractPdfText(arrayBuffer: ArrayBuffer): Promise<string | null> {
    try {
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;

      const textParts: string[] = [];
      const maxPages = Math.min(pdf.numPages, 100);

      for (let i = 1; i <= maxPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' ');
        textParts.push(pageText);
      }

      return this.normalizeExtractedText(textParts.join('\n\n'));
    } catch (error) {
      console.warn('Failed to extract PDF text:', error);
      return null;
    }
  }

  private normalizeExtractedText(text: string): string | null {
    let result = text;
    // Remove control characters (keep newlines and tabs)
    result = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    // Normalize common ligatures
    result = result.replace(/\uFB01/g, 'fi').replace(/\uFB02/g, 'fl');
    // Normalize unicode quotes and dashes
    result = result.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
    result = result.replace(/[\u2013\u2014]/g, '-');
    // Collapse multiple spaces to one (preserve newlines)
    result = result.replace(/[^\S\n]+/g, ' ');
    // Collapse 3+ newlines to 2
    result = result.replace(/\n{3,}/g, '\n\n');
    // Trim each line
    result = result.split('\n').map((l) => l.trim()).join('\n');
    result = result.trim();
    return result || null;
  }

  /**
   * Extract (or re-extract) text from an existing asset on demand.
   * Reads the file from OPFS, runs extraction, and updates the DB.
   */
  async extractAssetText(asset: Asset): Promise<string | null> {
    const file = await this.getAssetFile(asset);
    const arrayBuffer = await file.arrayBuffer();
    const extractedText = await this.extractText(file, arrayBuffer);
    await db.assets.update(asset.id, { extractedText });
    return extractedText;
  }

  async clearAssetText(assetId: string): Promise<void> {
    await db.assets.update(assetId, { extractedText: null });
  }
}

export const fileService = new FileService();

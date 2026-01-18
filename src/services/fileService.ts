import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { db } from '../db/database';
import { generateUUID, bufferToHex, getExtension } from '../utils';
import type { Asset, AssetId, InvestigationId } from '../types';

// Configure pdf.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

class FileService {
  private root: FileSystemDirectoryHandle | null = null;
  private initialized = false;

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

  async saveAsset(investigationId: InvestigationId, file: File): Promise<Asset> {
    await this.ensureInitialized();

    // 1. Calculate hash
    const arrayBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hash = bufferToHex(hashBuffer);

    // 2. Check if already exists (deduplication)
    const existing = await db.assets
      .where({ investigationId, hash })
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
    const dirHandle = await this.getAssetDirectory(investigationId);
    const extension = getExtension(file.name);
    const filename = `${hash}.${extension}`;

    // 4. Write file
    const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(arrayBuffer);
    await writable.close();

    // 5. Generate thumbnail if image or PDF
    const thumbnailDataUrl = await this.generateThumbnail(file, arrayBuffer);

    // 6. Extract text if possible
    const extractedText = await this.extractText(file, arrayBuffer);

    // 7. Create Asset entry
    const asset: Asset = {
      id: generateUUID(),
      investigationId,
      filename: file.name,
      mimeType: file.type,
      size: file.size,
      hash,
      opfsPath: `investigations/${investigationId}/assets/${filename}`,
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
    return fileHandle.getFile();
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

  async deleteInvestigationAssets(investigationId: InvestigationId): Promise<void> {
    await this.ensureInitialized();

    try {
      const investigations = await this.root!.getDirectoryHandle('investigations');
      await investigations.removeEntry(investigationId, { recursive: true });
    } catch (error) {
      console.warn('Failed to delete investigation directory:', error);
    }

    await db.assets.where({ investigationId }).delete();
  }

  async getAssetsByInvestigation(investigationId: InvestigationId): Promise<Asset[]> {
    return db.assets.where({ investigationId }).toArray();
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
      investigationId: InvestigationId;
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

    // Check if already exists locally (by hash for deduplication)
    const existing = await db.assets
      .where({ investigationId: assetData.investigationId, hash: assetData.hash })
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

    // Create OPFS path and write file
    const dirHandle = await this.getAssetDirectory(assetData.investigationId);
    const extension = getExtension(assetData.filename);
    const filename = `${assetData.hash}.${extension}`;

    const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(arrayBuffer);
    await writable.close();

    // Create Asset entry
    const asset: Asset = {
      id: assetData.id,
      investigationId: assetData.investigationId,
      filename: assetData.filename,
      mimeType: assetData.mimeType,
      size: assetData.size,
      hash: assetData.hash,
      opfsPath: `investigations/${assetData.investigationId}/assets/${filename}`,
      thumbnailDataUrl: assetData.thumbnailDataUrl,
      extractedText: assetData.extractedText,
      createdAt: assetData.createdAt,
    };

    await db.assets.add(asset);
    return asset;
  }

  private async getAssetDirectory(
    investigationId: InvestigationId
  ): Promise<FileSystemDirectoryHandle> {
    const investigations = await this.root!.getDirectoryHandle('investigations', {
      create: true,
    });
    const investigation = await investigations.getDirectoryHandle(investigationId, {
      create: true,
    });
    return investigation.getDirectoryHandle('assets', { create: true });
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
      // Load PDF document
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;

      // Get first page
      const page = await pdf.getPage(1);

      // Calculate scale for thumbnail (max 200x200)
      const viewport = page.getViewport({ scale: 1 });
      const maxSize = 200;
      const scale = Math.min(maxSize / viewport.width, maxSize / viewport.height);
      const scaledViewport = page.getViewport({ scale });

      // Create canvas and render
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(scaledViewport.width);
      canvas.height = Math.round(scaledViewport.height);

      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      // White background
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
      const maxPages = Math.min(pdf.numPages, 10); // Limit to first 10 pages

      for (let i = 1; i <= maxPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' ');
        textParts.push(pageText);
      }

      return textParts.join('\n\n');
    } catch (error) {
      console.warn('Failed to extract PDF text:', error);
      return null;
    }
  }
}

export const fileService = new FileService();

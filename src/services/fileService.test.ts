// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { fileService, FileValidationError } from './fileService';

/** Minimal File stand-in: validateFile only reads size, type and name. */
function makeFile(name: string, type: string, size = 1024): File {
  return { name, type, size } as File;
}

describe('fileService.validateFile', () => {
  it('accepts an ordinary image', () => {
    expect(() => fileService.validateFile(makeFile('photo.jpg', 'image/jpeg'))).not.toThrow();
  });

  it('accepts a file whose type the browser could not determine', () => {
    expect(() => fileService.validateFile(makeFile('notes.md', ''))).not.toThrow();
    expect(() =>
      fileService.validateFile(makeFile('archive.zip', 'application/octet-stream'))
    ).not.toThrow();
  });

  it('rejects a disallowed extension carried by an allowed MIME type', () => {
    // The ZIP import path builds the File from assetMeta.mimeType, which comes
    // straight out of the archive, so an OR let the attacker pick either side.
    expect(() => fileService.validateFile(makeFile('payload.php', 'image/png'))).toThrow(
      FileValidationError
    );
    expect(() => fileService.validateFile(makeFile('payload.exe', 'text/plain'))).toThrow(
      FileValidationError
    );
  });

  it('rejects a disallowed MIME type carried by an allowed extension', () => {
    expect(() =>
      fileService.validateFile(makeFile('photo.png', 'application/x-msdownload'))
    ).toThrow(FileValidationError);
  });

  it('judges a double extension on its last segment', () => {
    // .svg and .html are both allowed, so these stay accepted — the point is
    // that the decision is made on the extension, not on a claimed MIME type.
    expect(() => fileService.validateFile(makeFile('photo.jpg.svg', 'image/svg+xml'))).not.toThrow();
    expect(() => fileService.validateFile(makeFile('report.png.php', 'image/png'))).toThrow(
      FileValidationError
    );
  });

  it('still accepts browser spellings that used to pass on MIME alone', () => {
    // Before the switch to a conjunction these were accepted through their MIME
    // type. Keeping them keeps the change from breaking existing attachments.
    for (const name of ['photo.jfif', 'photo.jpe', 'clip.m4v', 'notes.markdown', 'song.oga']) {
      expect(() => fileService.validateFile(makeFile(name, ''))).not.toThrow();
    }
  });

  it('rejects a file over the size limit', () => {
    expect(() =>
      fileService.validateFile(makeFile('big.pdf', 'application/pdf', 200 * 1024 * 1024))
    ).toThrow(FileValidationError);
  });
});

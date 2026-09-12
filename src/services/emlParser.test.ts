import { describe, it, expect } from 'vitest';
import { parseEml, isEmlFile } from './emlParser';

function b64utf8(s: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(s)));
}

const SAMPLE = [
  'Return-Path: <bounce@mailer.example.net>',
  'Received: from mx1.example.com (mx1.example.com [203.0.113.10])',
  '\tby mail.dest.example (Postfix) with ESMTPS id ABC123',
  '\tfor <paul@dest.example>; Tue, 10 Sep 2026 14:32:11 +0200',
  'Received: from [192.168.1.42] (unknown [198.51.100.77])',
  '\tby mx1.example.com (Postfix) with ESMTPSA id XYZ789;',
  '\tTue, 10 Sep 2026 14:32:08 +0200',
  'From: =?utf-8?B?' + b64utf8('Jérôme Dupont') + '?= <jerome@example.com>',
  'To: Paul Martin <paul@dest.example>',
  'Cc: greffe@tribunal.example',
  'Reply-To: autre@exemple.org',
  'Subject: =?utf-8?Q?R=C3=A9union_confidentielle?=',
  'Date: Tue, 10 Sep 2026 14:32:05 +0200',
  'Message-ID: <20260910143205.GA1234@example.com>',
  'X-Mailer: Thunderbird 128.0',
  'MIME-Version: 1.0',
  'Content-Type: multipart/mixed; boundary="OUTER"',
  '',
  'Preambule ignore.',
  '--OUTER',
  'Content-Type: multipart/alternative; boundary="INNER"',
  '',
  '--INNER',
  'Content-Type: text/plain; charset=utf-8',
  'Content-Transfer-Encoding: quoted-printable',
  '',
  'Bonjour, rendez-vous =C3=A0 14h pr=C3=A9cises.',
  '--INNER',
  'Content-Type: text/html; charset=utf-8',
  'Content-Transfer-Encoding: base64',
  '',
  b64utf8('<p>Bonjour, rendez-vous à 14h précises.</p>'),
  '--INNER--',
  '--OUTER',
  'Content-Type: application/pdf; name="contrat.pdf"',
  'Content-Disposition: attachment; filename="contrat.pdf"',
  'Content-Transfer-Encoding: base64',
  '',
  btoa('%PDF-1.4 fake'),
  '--OUTER--',
  '',
].join('\r\n');

describe('parseEml', () => {
  const eml = parseEml(SAMPLE);

  it('decodes RFC 2047 encoded-words in From and Subject', () => {
    expect(eml.from).toBe('Jérôme Dupont <jerome@example.com>');
    expect(eml.subject).toBe('Réunion confidentielle');
  });

  it('parses recipients, reply-to and message-id', () => {
    expect(eml.to).toBe('Paul Martin <paul@dest.example>');
    expect(eml.cc).toBe('greffe@tribunal.example');
    expect(eml.replyTo).toBe('autre@exemple.org');
    expect(eml.messageId).toBe('<20260910143205.GA1234@example.com>');
    expect(eml.mailer).toBe('Thunderbird 128.0');
  });

  it('parses the date', () => {
    expect(eml.date).not.toBeNull();
    expect(eml.date!.toISOString()).toBe('2026-09-10T12:32:05.000Z');
  });

  it('finds the originating public IP from the oldest Received hop', () => {
    // 192.168.1.42 is private and must be skipped; 198.51.100.77 is the sender
    expect(eml.originIp).toBe('198.51.100.77');
    expect(eml.received).toHaveLength(2);
  });

  it('decodes the quoted-printable text body', () => {
    expect(eml.textBody).toBe('Bonjour, rendez-vous à 14h précises.');
  });

  it('decodes the base64 html body', () => {
    expect(eml.htmlBody).toContain('rendez-vous à 14h précises');
  });

  it('lists attachments without inlining them as body', () => {
    expect(eml.attachments).toHaveLength(1);
    expect(eml.attachments[0].filename).toBe('contrat.pdf');
    expect(eml.attachments[0].mimeType).toBe('application/pdf');
  });

  it('extracts body links and remote images separately', () => {
    const mail = parseEml(
      [
        'From: a@b.c',
        'Content-Type: text/html; charset=utf-8',
        '',
        '<p>Voir <a href="https://evil.example/payer?id=42">ici</a> et https nu.</p>',
        '<img src="https://track.example/pixel.gif?u=42" width="1">',
        '<a href="https://evil.example/payer?id=42">doublon</a>',
      ].join('\r\n')
    );
    expect(mail.links).toEqual(['https://evil.example/payer?id=42']);
    expect(mail.imageLinks).toEqual(['https://track.example/pixel.gif?u=42']);
  });

  it('finds plain-text URLs and strips trailing punctuation', () => {
    const mail = parseEml(
      'From: a@b.c\r\n\r\nRendez-vous sur https://exemple.org/page. Merci.'
    );
    expect(mail.links).toEqual(['https://exemple.org/page']);
  });

  it('handles a minimal single-part message', () => {
    const simple = parseEml(
      'From: a@b.c\r\nSubject: Test\r\n\r\nCorps simple.'
    );
    expect(simple.from).toBe('a@b.c');
    expect(simple.textBody).toBe('Corps simple.');
    expect(simple.attachments).toHaveLength(0);
  });
});

describe('isEmlFile', () => {
  it('matches by mime type and extension', () => {
    expect(isEmlFile('mail.eml', 'application/octet-stream')).toBe(true);
    expect(isEmlFile('mail.txt', 'message/rfc822')).toBe(true);
    expect(isEmlFile('doc.pdf', 'application/pdf')).toBe(false);
  });
});

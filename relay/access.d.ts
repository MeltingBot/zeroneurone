/** Types of relay/access.js, for the app's tests that check both halves agree */
export const SIGNED_ROOM_PREFIX: string;
export const WRITE_PROOF_MAX_AGE_S: number;
export const CATEGORY: Readonly<{ presence: 1; request: 2; data: 3 }>;
export function roomIdForKey(publicKey: Uint8Array): string;
export function writeProofMessage(roomId: string, timestamp: number): string;
export function accessOf(roomId: string, params: URLSearchParams, nowSeconds?: number): { writer: boolean } | { refused: string };
export function categoryOf(data: Uint8Array): number | null;
export function readerMayRelay(data: Uint8Array): boolean;

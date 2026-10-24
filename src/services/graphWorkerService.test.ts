import { describe, it, expect, vi, beforeEach } from 'vitest';

// Fake worker: records the messages, lets the test answer them in order
class FakeWorker {
  static last: FakeWorker;
  sent: { type: string; requestId: number }[] = [];
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  constructor() { FakeWorker.last = this; }
  postMessage(message: { type: string; requestId: number }) { this.sent.push(message); }
  answer(data: unknown) { this.onmessage?.({ data }); }
  terminate() {}
}

describe('graphWorkerService', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('Worker', FakeWorker);
  });

  it('gives each answer to its own request: a layout does not cancel insights nor get their result', async () => {
    const { graphWorkerService } = await import('./graphWorkerService');
    const insights = graphWorkerService.computeInsights([], []);
    const layout = graphWorkerService.computeLayout([], [], { layoutType: 'force' });
    const [insightsMsg, layoutMsg] = FakeWorker.last.sent;

    // The worker answers in order
    FakeWorker.last.answer({ type: 'insightsResult', data: { clusters: [] }, requestId: insightsMsg.requestId });
    FakeWorker.last.answer({ type: 'layoutResult', positions: { a: { x: 1, y: 2 } }, requestId: layoutMsg.requestId });

    await expect(insights).resolves.toEqual({ clusters: [] });
    await expect(layout).resolves.toEqual({ a: { x: 1, y: 2 } });
  });

  it('a newer request of the same kind replaces the older one, whose late answer is dropped', async () => {
    const { graphWorkerService, SupersededError } = await import('./graphWorkerService');
    const first = graphWorkerService.computeInsights([], []);
    const second = graphWorkerService.computeInsights([], []);
    await expect(first).rejects.toBeInstanceOf(SupersededError);
    const [firstMsg, secondMsg] = FakeWorker.last.sent;

    FakeWorker.last.answer({ type: 'insightsResult', data: { stale: true }, requestId: firstMsg.requestId });
    FakeWorker.last.answer({ type: 'insightsResult', data: { fresh: true }, requestId: secondMsg.requestId });
    await expect(second).resolves.toEqual({ fresh: true });
  });
});

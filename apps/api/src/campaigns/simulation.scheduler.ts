import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';

/** Tracks every simulation timer so a demo reset can cancel them all. */
@Injectable()
export class SimulationScheduler implements OnModuleDestroy {
  private readonly timers = new Set<NodeJS.Timeout>();
  private readonly log = new Logger('Simulation');
  private gen = 0;

  /** Bumped by every demo reset; long-running work compares it to know it has been superseded. */
  get generation(): number {
    return this.gen;
  }

  /** Run `fn` after `ms`, unless the demo is reset first. */
  later(ms: number, fn: () => Promise<void> | void) {
    const gen = this.gen;
    const t = setTimeout(() => {
      this.timers.delete(t);
      if (gen !== this.gen) return;
      Promise.resolve()
        .then(fn)
        .catch((e: unknown) => this.log.warn(`simulation step failed: ${(e as Error).message}`));
    }, ms);
    this.timers.add(t);
  }

  clearAll() {
    this.gen++;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  onModuleDestroy() {
    this.clearAll();
  }
}

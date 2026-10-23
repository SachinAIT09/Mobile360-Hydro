import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

/** How often due SCHEDULED campaigns are polled for. */
export const DISPATCH_POLL_MS = 5000;

/**
 * Sends SCHEDULED campaigns when they fall due. Mongo-backed (state lives on the campaign docs), so it
 * survives restarts and a demo reset simply drops the rows. Filled in by the campaign tools workstream.
 */
@Injectable()
export class CampaignDispatcher implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('CampaignDispatcher');
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  onModuleInit() {
    this.timer = setInterval(() => {
      if (this.running) return;
      this.running = true;
      this.tick()
        .catch((e: unknown) => this.log.warn(`dispatch tick failed: ${(e as Error).message}`))
        .finally(() => {
          this.running = false;
        });
    }, DISPATCH_POLL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Claim and dispatch every due SCHEDULED campaign. */
  async tick(): Promise<void> {
    // Not implemented yet.
  }
}

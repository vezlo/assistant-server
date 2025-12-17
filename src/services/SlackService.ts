import { App } from '@slack/bolt';
import logger from '../config/logger';

export class SlackService {
  private app: App | null = null;
  private botToken: string | null = null;
  private signingSecret: string | null = null;

  constructor() {
    this.botToken = process.env.SLACK_BOT_TOKEN || null;
    this.signingSecret = process.env.SLACK_SIGNING_SECRET || null;

    if (this.botToken && this.signingSecret) {
      this.app = new App({
        token: this.botToken,
        signingSecret: this.signingSecret,
        socketMode: false,
      });
      logger.info('✅ Slack service initialized');
    } else {
      logger.warn('⚠️  Slack integration disabled: SLACK_BOT_TOKEN or SLACK_SIGNING_SECRET not set');
    }
  }

  isEnabled(): boolean {
    return this.app !== null && this.botToken !== null;
  }

  getApp(): App | null {
    return this.app;
  }

  async sendMessage(channel: string, text: string, threadTs?: string): Promise<void> {
    if (!this.app) {
      throw new Error('Slack integration not enabled');
    }

    try {
      await this.app.client.chat.postMessage({
        token: this.botToken!,
        channel,
        text,
        thread_ts: threadTs,
      });
      logger.info(`Slack message sent to channel: ${channel}`);
    } catch (error) {
      logger.error('Failed to send Slack message:', error);
      throw error;
    }
  }

  async sendMessageInChunks(channel: string, content: string, threadTs?: string): Promise<void> {
    if (!this.app) {
      throw new Error('Slack integration not enabled');
    }

    // Slack has a 40KB message limit, split if needed
    const chunks = this.splitMessage(content);
    
    for (const chunk of chunks) {
      await this.sendMessage(channel, chunk, threadTs);
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  async addReaction(channel: string, timestamp: string, emoji: string): Promise<void> {
    if (!this.app) {
      throw new Error('Slack integration not enabled');
    }

    try {
      await this.app.client.reactions.add({
        token: this.botToken!,
        channel,
        timestamp,
        name: emoji,
      });
      logger.debug(`Added reaction :${emoji}: to message ${timestamp}`);
    } catch (error) {
      // Ignore if reaction already exists or other minor errors
      logger.debug(`Failed to add reaction (non-critical): ${error}`);
    }
  }

  async removeReaction(channel: string, timestamp: string, emoji: string): Promise<void> {
    if (!this.app) {
      throw new Error('Slack integration not enabled');
    }

    try {
      await this.app.client.reactions.remove({
        token: this.botToken!,
        channel,
        timestamp,
        name: emoji,
      });
      logger.debug(`Removed reaction :${emoji}: from message ${timestamp}`);
    } catch (error) {
      // Ignore if reaction doesn't exist or other minor errors
      logger.debug(`Failed to remove reaction (non-critical): ${error}`);
    }
  }

  private splitMessage(text: string, maxLength: number = 3000): string[] {
    if (text.length <= maxLength) {
      return [text];
    }

    const chunks: string[] = [];
    let currentChunk = '';

    const lines = text.split('\n');
    for (const line of lines) {
      if (currentChunk.length + line.length + 1 > maxLength) {
        chunks.push(currentChunk);
        currentChunk = line;
      } else {
        currentChunk += (currentChunk ? '\n' : '') + line;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk);
    }

    return chunks;
  }

  verifySignature(body: string, timestamp: string, signature: string): boolean {
    if (!this.signingSecret) {
      return false;
    }

    const crypto = require('crypto');
    const hmac = crypto.createHmac('sha256', this.signingSecret);
    hmac.update(`v0:${timestamp}:${body}`);
    const computedSignature = `v0=${hmac.digest('hex')}`;

    return crypto.timingSafeEqual(
      Buffer.from(computedSignature),
      Buffer.from(signature)
    );
  }
}


import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import logger from '../config/logger';

export class RealtimePublisher {
  private client: SupabaseClient;

  constructor(supabaseUrl: string, serviceKey: string) {
    this.client = createClient(supabaseUrl, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }

  async publish(channelName: string, event: string, payload: Record<string, unknown>) {
    try {
      logger.info(`[RealtimePublisher] Publishing event "${event}" to channel "${channelName}"`);
      const channel = this.client.channel(channelName);

      const result = await channel.send({
              type: 'broadcast',
        event: event,
        payload: payload
      });

      if (result !== 'ok') {
        const errorMsg = `Failed to send broadcast: ${result}`;
        logger.error(`[RealtimePublisher] ${errorMsg}`);
        throw new Error(errorMsg);
      }

      logger.info(`[RealtimePublisher] Successfully published event "${event}" to channel "${channelName}"`);
      await channel.unsubscribe();
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`[RealtimePublisher] Failed to publish realtime event: ${errorMessage}`, error);
      throw error;
    }
  }
}


import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add Slack integration fields to vezlo_conversations
  await knex.schema.table('vezlo_conversations', (table) => {
    table.text('slack_channel_id').comment('Slack channel ID for integration');
    table.text('slack_thread_ts').comment('Slack thread timestamp for integration');
  });

  // Add index for Slack lookups
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_vezlo_conversations_slack_thread 
    ON vezlo_conversations(slack_channel_id, slack_thread_ts) 
    WHERE slack_channel_id IS NOT NULL AND slack_thread_ts IS NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Drop index
  await knex.raw('DROP INDEX IF EXISTS idx_vezlo_conversations_slack_thread');

  // Drop columns
  await knex.schema.table('vezlo_conversations', (table) => {
    table.dropColumn('slack_channel_id');
    table.dropColumn('slack_thread_ts');
  });
}


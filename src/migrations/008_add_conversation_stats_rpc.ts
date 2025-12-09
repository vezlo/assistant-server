import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // RPC for conversation stats
  await knex.raw(`
    CREATE OR REPLACE FUNCTION get_conversation_stats(p_company_id bigint)
    RETURNS json
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      result json;
    BEGIN
      SELECT json_build_object(
        'total', COUNT(*),
        'closed', COUNT(CASE WHEN closed_at IS NOT NULL THEN 1 END),
        'open', COUNT(CASE WHEN closed_at IS NULL THEN 1 END)
      )
      INTO result
      FROM vezlo_conversations
      WHERE company_id = p_company_id
      AND deleted_at IS NULL;
      
      RETURN result;
    END;
    $$;
  `);

  // RPC for feedback stats
  await knex.raw(`
    CREATE OR REPLACE FUNCTION get_feedback_stats(p_company_id bigint)
    RETURNS json
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      result json;
    BEGIN
      SELECT json_build_object(
        'total', COUNT(*),
        'likes', COUNT(CASE WHEN rating = 'positive' THEN 1 END),
        'dislikes', COUNT(CASE WHEN rating = 'negative' THEN 1 END)
      )
      INTO result
      FROM vezlo_message_feedback
      WHERE company_id = p_company_id;
      
      RETURN result;
    END;
    $$;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP FUNCTION IF EXISTS get_feedback_stats(bigint);');
  await knex.raw('DROP FUNCTION IF EXISTS get_conversation_stats(bigint);');
}

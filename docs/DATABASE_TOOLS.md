# Database Tools Feature

## Overview
The Database Tools feature enables the AI assistant to query user-specific data from external Supabase databases using natural language.

## Architecture

### Backend Components
- **Services**: `DatabaseToolConfigService.ts`, `DatabaseToolService.ts`
- **Controller**: `DatabaseToolConfigController.ts`
- **Migration**: `011_create_database_tool_configs.ts`
- **Routes**: `/api/database-tools/*` (13 endpoints)

### How It Works
1. Admin configures external database credentials (encrypted with AES-256)
2. Admin creates tools by selecting tables and columns via UI
3. Tools are saved in `vezlo_database_tools` table with metadata
4. When user asks a question, LLM receives available tool definitions
5. If database query detected, LLM selects appropriate tool
6. `DatabaseToolService` dynamically generates SELECT query
7. User context filters applied automatically (e.g., `uuid = user_uuid`)
8. Results returned to LLM for natural language formatting

### Security
- **Read-Only**: Only SELECT queries, no writes to external database
- **User Filtering**: Configurable per-tool user context filtering
- **Encrypted Storage**: Database credentials encrypted at rest
- **Schema Discovery**: Uses Supabase OpenAPI (read-only, no setup required)

## API Endpoints

### Configuration
- `POST /api/database-tools/config` - Create database config
- `GET /api/database-tools/config` - Get current config
- `PUT /api/database-tools/config/:configId` - Update config
- `DELETE /api/database-tools/config/:configId` - Delete config
- `POST /api/database-tools/validate` - Validate connection

### Schema Introspection
- `POST /api/database-tools/tables` - List tables (with credentials)
- `POST /api/database-tools/tables/:tableName/schema` - Get table schema
- `GET /api/database-tools/config/:configId/tables` - List tables (from saved config)
- `GET /api/database-tools/config/:configId/tables/:tableName/schema` - Get schema (from saved config)

### Tool Management
- `POST /api/database-tools/tools` - Create tool
- `GET /api/database-tools/tools` - List all tools
- `PUT /api/database-tools/tools/:toolId` - Update tool
- `DELETE /api/database-tools/tools/:toolId` - Delete tool

## Database Schema

### Table: `vezlo_database_tools`
```typescript
{
  id: string,                      // UUID
  config_id: string,               // Links to database config
  table_name: string,              // Target table
  tool_name: string,               // Function name for LLM
  tool_description: string,        // Helps LLM decide when to use
  columns: jsonb,                  // Array of column names
  id_column: string,               // Primary key column
  id_column_type: string,          // 'integer' | 'uuid' | 'string'
  requires_user_context: boolean,  // Enable filtering?
  user_filter_column: string,      // Filter by this column
  user_filter_type: string,        // 'integer' | 'uuid' | 'string'
  user_context_key: string,        // 'user_uuid' | 'user_id' | 'company_uuid' | 'company_id'
  enabled: boolean,                // Is tool active?
  created_at: timestamp,
  updated_at: timestamp
}
```

## User Context Integration

Pass user context from widget for user-specific filtering:

```javascript
addVezloChatWidget('WIDGET_UUID', 'API_URL', {
  userContext: {
    user_uuid: 'ce7f61f4-...',
    company_uuid: '45e2b2d9-...'
  }
});
```

The backend automatically filters queries based on tool configuration.

## Example Tool Configuration

```json
{
  "table_name": "vezlo_users",
  "tool_name": "get_vezlo_users",
  "tool_description": "Retrieve user profile details",
  "columns": ["id", "name", "email", "created_at"],
  "id_column": "id",
  "id_column_type": "integer",
  "requires_user_context": true,
  "user_filter_column": "uuid",
  "user_filter_type": "uuid",
  "user_context_key": "user_uuid"
}
```

**Generated Query** (when user asks "show my profile"):
```sql
SELECT id, name, email, created_at 
FROM vezlo_users 
WHERE uuid = 'ce7f61f4-d502-427f-b448-f38ca38c5868'
```

## Troubleshooting

**Connection Failed**: Verify Supabase URL and service_role key  
**No Data Found**: Check user context is passed from widget  
**Tool Not Called**: Ensure tool name/description are clear and descriptive  
**Schema Load Failed**: Verify external database credentials are valid

---

**Last Updated**: January 2026  
**Vezlo Version**: 2.11.0

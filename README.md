# Vezlo AI Assistant Server

[![npm version](https://img.shields.io/npm/v/@vezlo/assistant-server.svg)](https://www.npmjs.com/package/@vezlo/assistant-server) [![license](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](https://opensource.org/licenses/AGPL-3.0)

🚀 **Production-ready Node.js/TypeScript API server** for the Vezlo AI Assistant platform - Complete backend APIs with advanced RAG (chunk-based semantic search + adjacent retrieval), Docker deployment, and database migrations.

**📋 [Changelog](./CHANGELOG.md)** | **🐛 [Report Issue](https://github.com/vezlo/assistant-server/issues)** | **💬 [Discussions](https://github.com/vezlo/assistant-server/discussions)**

## 🚨 Breaking Change Notice

### v2.3.0 - Enhanced RAG System
**New chunk-based architecture with adjacent retrieval for better code understanding.**

- **Database Schema**: New `vezlo_knowledge_chunks` table and RPC functions
- **Embedding Model**: Upgraded to `text-embedding-3-large` (3072 dimensions)
- **Migration**: Automatic via `npm run migrate:latest` (migration 006)
- **Rollback**: Supported via `npm run migrate:rollback`

**Upgrade Steps:**
```bash
npm install @vezlo/assistant-server@latest
npm run migrate:latest
```

### v2.0.0 - Multi-tenancy Support
**Introduced multi-tenancy with authentication. Existing data not auto-migrated.**

See [CHANGELOG.md](./CHANGELOG.md) for complete migration guide.

---

## 🏗️ Architecture

- **Backend APIs** - RESTful API endpoints for AI chat and knowledge management
- **AI Response Validation** - LLM-as-Judge validation with developer/user modes via `@vezlo/ai-validator`
- **Real-time Communication** - WebSocket support for live chat with Supabase Realtime broadcasting
- **Human Agent Handoff** - Agent join/leave workflows with realtime status updates and message synchronization
- **Advanced RAG System** - Chunk-based semantic search with adjacent retrieval using OpenAI text-embedding-3-large (3072 dims) and pgvector
- **Conversation Management** - Persistent conversation history with agent support
- **Slack Integration** - Direct query bot with full AI responses, conversation history, and reaction-based feedback ([setup guide](./docs/SLACK_INTEGRATION.md))
- **Feedback System** - Message rating and improvement tracking
- **Database Migrations** - Knex.js migration system for schema management
- **Production Ready** - Docker containerization with health checks

## 📦 Installation

### Option 1: Install from npm (Recommended)

```bash
# Install globally
npm install -g @vezlo/assistant-server

# Or install in your project
npm install @vezlo/assistant-server
```

### Option 2: Clone from GitHub

```bash
git clone https://github.com/vezlo/assistant-server.git
cd assistant-server
npm install
```

## 🏪 Vercel Marketplace Integration

**🚀 Recommended for Vercel Users** - Deploy with automated setup:

[![Install on Vercel](https://vercel.com/button)](https://vercel.com/marketplace/vezlo-assistant-server)

The Vercel Marketplace integration provides:
- **Guided Configuration** - Step-by-step setup wizard
- **Automatic Environment Setup** - No manual configuration needed
- **Database Migration** - Automatic table creation
- **Production Optimization** - Optimized for Vercel's serverless platform

[Learn more about the marketplace integration →](https://vercel.com/marketplace/vezlo-assistant-server)

## 🚀 Quick Start (Interactive Setup)

### Prerequisites
- Node.js 20+ and npm 9+
- Supabase project
- OpenAI API key

### Easy Setup with Interactive Wizard

The fastest way to get started is with our interactive setup wizard:

```bash
# If installed globally
vezlo-setup

# If installed locally
npx vezlo-setup

# Or if cloned from GitHub
npm run setup
```

The wizard will guide you through:
1. **Supabase Configuration** - URL, Service Role Key, DB host/port/name/user/password (with defaults)
2. **OpenAI Configuration** - API key, model, temperature, max tokens
3. **Validation (non‑blocking)** - Tests Supabase API and DB connectivity
4. **Migrations** - Runs Knex migrations if DB validation passes; otherwise shows how to run later
5. **Environment** - Generates `.env` (does not overwrite if it already exists)
6. **Default Data Seeding** - Creates default admin user and company
7. **API Key Generation** - Generates API key for the default company

After setup completes, start the server:

```bash
vezlo-server
```

### Manual Setup (Advanced)

If you prefer manual configuration:

#### 1. Create Environment File

```bash
# Copy example file
cp env.example .env

# Edit with your credentials
nano .env
```

#### 2. Configure Database

Get your Supabase credentials from:
- **Dashboard** → Settings → API
- **Database** → Settings → Connection string

```env
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-role-key

# Database Configuration for Migrations
SUPABASE_DB_HOST=db.your-project.supabase.co
SUPABASE_DB_PORT=5432
SUPABASE_DB_NAME=postgres
SUPABASE_DB_USER=postgres
SUPABASE_DB_PASSWORD=your-database-password

# OpenAI Configuration
OPENAI_API_KEY=sk-your-api-key
AI_MODEL=gpt-4o

# Migration Security
MIGRATION_SECRET_KEY=your-secure-migration-key-here

# AI Response Validation (Optional)
AI_VALIDATION_ENABLED=false

# Developer Mode (Optional)
# true = Strict code grounding for technical queries
# false = User-friendly generic responses
DEVELOPER_MODE=false
```

#### 3. Run Database Migrations (Recommended)
```bash
# Using Knex migrations (primary method)
npm run migrate:latest

# Or via API after server is running
curl "http://localhost:3000/api/migrate?key=$MIGRATION_SECRET_KEY"
```

#### 4. Create Default Admin & Generate API Key
```bash
# Create default admin user and company (if not exists)
npm run seed-default

# Generate API key for library integration
npm run generate-key
```

Optional fallback (not recommended if using migrations):
```bash
# Run raw SQL in Supabase Dashboard → SQL Editor
cat database-schema.sql
```

#### 5. Validate Setup

```bash
# Verify database connection and tables
vezlo-validate

# Or with npm
npm run validate
```

#### 6. Start Server

```bash
# If installed globally
vezlo-server

# If installed locally
npx vezlo-server

# Or from source
npm run build && npm start
```

### Docker Setup

1. Copy the environment template and fill in your Supabase/OpenAI values:
   ```bash
   cp env.example .env
   # edit .env with your credentials before continuing
   ```
2. Build and start the stack:
   ```bash
   docker-compose build
   docker-compose up -d
   ```
   The entrypoint runs migrations, seeds the default org/admin, and generates an API key automatically.
3. View container logs:
   ```bash
   docker-compose logs -f vezlo-server
   ```

## ☁️ Vercel Deployment

Deploy to Vercel's serverless platform with multiple options. The Marketplace integration collects your credentials during configuration and sets environment variables automatically.

### Option 1: Vercel Marketplace Integration (Recommended)

**🚀 Deploy via Vercel Marketplace** - Automated setup with guided configuration:

[![Install on Vercel](https://vercel.com/button)](https://vercel.com/marketplace/vezlo-assistant-server)

**Benefits:**
- ✅ **Guided Setup** - Step-by-step configuration wizard
- ✅ **Automatic Environment Variables** - No manual env var configuration needed
- ✅ **Database Migration** - Automatic table creation and schema setup
- ✅ **Production Ready** - Optimized for Vercel's serverless platform

**After Installation:**
1. Run the migration URL: `https://your-project.vercel.app/api/migrate?key=YOUR_MIGRATION_SECRET`
2. Verify deployment: `https://your-project.vercel.app/health`
3. Access API docs: `https://your-project.vercel.app/docs`
### Option 2: One-Click Deploy Button

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vezlo/assistant-server&integration-ids=oac_f2GcBt8U4FhiVJ4qWv5PYMEZ)

This will:
- Fork the repository to your GitHub
- Create a Vercel project
- Require marketplace integration setup
- Deploy automatically

### Option 3: Manual Vercel Deploy

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Follow prompts to configure
```

### Prerequisites for Vercel

1. Supabase project (URL, Service Role key, DB host/port/name/user/password)
2. OpenAI API key
3. If not using the Marketplace, add environment variables in Vercel project settings
4. Disable Vercel Deployment Protection if the API needs to be publicly accessible; otherwise Vercel shows its SSO page and the browser never reaches your server.

See [docs/VERCEL_DEPLOYMENT.md](docs/VERCEL_DEPLOYMENT.md) for detailed deployment guide.

## 🔧 Environment Configuration

Edit `.env` file with your credentials:

```bash
# REQUIRED - Supabase Configuration
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key

# REQUIRED - Database Configuration for Knex.js Migrations
SUPABASE_DB_HOST=db.your-project.supabase.co
SUPABASE_DB_PORT=5432
SUPABASE_DB_NAME=postgres
SUPABASE_DB_USER=postgres
SUPABASE_DB_PASSWORD=your-database-password

# REQUIRED - OpenAI Configuration
OPENAI_API_KEY=sk-your-openai-api-key
AI_MODEL=gpt-4o
AI_TEMPERATURE=0.7
AI_MAX_TOKENS=1000

# REQUIRED - Database Migration Security
MIGRATION_SECRET_KEY=your-secure-migration-key-here

# REQUIRED - Authentication
JWT_SECRET=your-super-secret-jwt-key-here-change-this-in-production
DEFAULT_ADMIN_EMAIL=admin@vezlo.org
DEFAULT_ADMIN_PASSWORD=admin123

# OPTIONAL - Server Configuration
PORT=3000
NODE_ENV=production
LOG_LEVEL=info

# OPTIONAL - CORS Configuration
CORS_ORIGINS=http://localhost:3000,http://localhost:5173

# OPTIONAL - Swagger Base URL
BASE_URL=http://localhost:3000

# OPTIONAL - Rate Limiting
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX=100

# OPTIONAL - Organization Settings
ORGANIZATION_NAME=Vezlo
ASSISTANT_NAME=Vezlo Assistant

# OPTIONAL - Knowledge Base (uses text-embedding-3-large, 3072 dims)
CHUNK_SIZE=1000
CHUNK_OVERLAP=200
```

## 🔧 CLI Commands

The package provides these command-line tools:

### vezlo-setup
Interactive setup wizard that guides you through configuration.

```bash
vezlo-setup
```

### vezlo-seed-default
Creates default admin user and company.

```bash
vezlo-seed-default
```

### vezlo-generate-key
Generates API key for the default admin's company. The API key is used by src-to-kb library.

```bash
vezlo-generate-key
```

### vezlo-validate
Validates database connection and verifies all tables exist.

```bash
vezlo-validate
```

### vezlo-server
Starts the API server.

```bash
vezlo-server
```

## 📚 API Documentation

### Base URL
```
http://localhost:3000/api
```

### Interactive Documentation
- **Swagger UI**: `http://localhost:3000/docs`
- **Health Check**: `http://localhost:3000/health`

### Core Endpoints

#### Conversations
- `POST /api/conversations` - Create new conversation (public widget endpoint)
- `GET /api/conversations` - List company conversations (agent dashboard)
- `GET /api/conversations/:uuid` - Get conversation with messages
- `DELETE /api/conversations/:uuid` - Delete conversation
- `POST /api/conversations/:uuid/join` - Agent joins a conversation
- `POST /api/conversations/:uuid/messages/agent` - Agent sends a message
- `POST /api/conversations/:uuid/close` - Agent closes a conversation

#### Messages
- `POST /api/conversations/:uuid/messages` - Create user message
- `POST /api/messages/:uuid/generate` - Generate AI response

#### Knowledge Base
- `POST /api/knowledge/items` - Create knowledge item (supports raw content, pre-chunked data, or chunks with embeddings)
- `GET /api/knowledge/items` - List knowledge items
- `GET /api/knowledge/items/:uuid` - Get knowledge item
- `PUT /api/knowledge/items/:uuid` - Update knowledge item
- `DELETE /api/knowledge/items/:uuid` - Delete knowledge item

**Knowledge Ingestion Options:**
- **Raw Content**: Send `content` field, server creates chunks and embeddings
- **Pre-chunked**: Send `chunks` array with `hasEmbeddings: false`, server generates embeddings
- **Chunks + Embeddings**: Send `chunks` array with embeddings and `hasEmbeddings: true`, server stores directly

#### Database Migrations
- `GET /api/migrate?key=<secret>` - Run pending database migrations
- `GET /api/migrate/status?key=<secret>` - Check migration status

**Migration Workflow:**
1. **Create Migration**: Use `npm run migrate:make migration_name` to create new migration files
2. **Check Status**: Use `/api/migrate/status` to see pending migrations
3. **Run Migrations**: Use `/api/migrate` to execute pending migrations remotely

**Migration Endpoints Usage:**
```bash
# Check migration status
curl "http://localhost:3000/api/migrate/status?key=your-migration-secret-key"

# Run pending migrations
curl "http://localhost:3000/api/migrate?key=your-migration-secret-key"
```

**Required Environment Variable:**
- `MIGRATION_SECRET_KEY` - Secret key for authenticating migration requests

**Migration Creation Example:**
```bash
# Create a new migration
npm run migrate:make add_users_table

# This creates: src/migrations/002_add_users_table.ts
# Edit the file to add your schema changes
# Then run via endpoint or command line
```

#### Knowledge Search
- `POST /api/knowledge/search` - Search knowledge base

#### Feedback
- `POST /api/feedback` - Submit message feedback (Public API)
- `DELETE /api/feedback/:uuid` - Delete/undo message feedback (Public API)

### WebSocket Events
- `join-conversation` - Join conversation room
- `conversation:message` - Real-time message updates

## 💬 Conversation 2-API Flow

The conversation system follows the industry-standard **2-API flow** pattern for AI chat applications:

### 1. Create User Message
```bash
POST /api/conversations/{conversation-uuid}/messages
```
**Purpose**: Store the user's message in the conversation
**Response**: Returns the user message with UUID

### 2. Generate AI Response  
```bash
POST /api/messages/{message-uuid}/generate
```
**Purpose**: Generate AI response based on the user message
**Response**: Returns the AI assistant's response

### Why 2-API Flow?

This pattern is the **global recognized standard** because:

✅ **Separation of Concerns**
- User message storage is separate from AI generation
- Allows for message persistence even if AI generation fails
- Enables message history and conversation management

✅ **Reliability & Error Handling**
- User messages are saved immediately
- AI generation can be retried independently
- Partial failures don't lose user input

✅ **Scalability**
- AI generation can be queued/processed asynchronously
- Different rate limits for storage vs generation
- Enables streaming responses and real-time updates

✅ **Industry Standard**
- Used by OpenAI, Anthropic, Google, and other major AI platforms
- Familiar pattern for developers
- Enables advanced features like message regeneration, threading, and branching

### Example Flow:
```bash
# 1. User sends message
curl -X POST /api/conversations/abc123/messages \
  -d '{"content": "How do I integrate your API?"}'
# Response: {"uuid": "msg456", "content": "How do I integrate your API?", ...}

# 2. Generate AI response
curl -X POST /api/messages/msg456/generate \
  -d '{}'
# Response: {"uuid": "msg789", "content": "To integrate our API...", ...}
```

## 🗄️ Database Setup

### Option A: Run Migrations (Recommended)

Use the built‑in migration endpoints to create/upgrade tables:

```bash
# Run pending migrations
curl "http://localhost:3000/api/migrate?key=your-migration-secret-key"

# Check migration status
curl "http://localhost:3000/api/migrate/status?key=your-migration-secret-key"
```

These endpoints execute Knex migrations and keep schema versioned.

### Option B: Manual SQL (Fallback)

If you prefer manual setup, run the SQL schema in Supabase SQL Editor:

```bash
# View the schema SQL locally
cat database-schema.sql

# Copy into Supabase Dashboard → SQL Editor and execute
```

The `database-schema.sql` contains all required tables and functions.

## 🐳 Docker Commands

```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f vezlo-server

# Stop services
docker-compose down

# Rebuild and start
docker-compose up -d --build

# View running containers
docker-compose ps

# Access container shell
docker exec -it vezlo-server sh
```

## 🧪 Testing the API

### Health Check
```bash
curl http://localhost:3000/health
```

### Complete Conversation Flow
```bash
# 1. Create conversation
CONV_UUID=$(curl -X POST http://localhost:3000/api/conversations \
  -H "Content-Type: application/json" \
  -d '{"title": "Test Conversation", "user_uuid": 12345, "company_uuid": 67890}' \
  | jq -r '.uuid')

# 2. Send user message
MSG_UUID=$(curl -X POST http://localhost:3000/api/conversations/$CONV_UUID/messages \
  -H "Content-Type: application/json" \
  -d '{"content": "Hello, how can you help me?"}' \
  | jq -r '.uuid')

# 3. Generate AI response
curl -X POST http://localhost:3000/api/messages/$MSG_UUID/generate \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Search Knowledge Base
```bash
curl -X POST http://localhost:3000/api/knowledge/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "How to use the API?",
    "limit": 5,
    "threshold": 0.7,
    "type": "hybrid"
  }'
```

## 🔧 Development

### Local Development Setup
```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Start server (Node)
npm start

# Or start via CLI wrapper
npx vezlo-server

# Run tests
npm test
```

### Project Structure
```
vezlo/
├── docs/                # Documentation
│   ├── DEVELOPER_GUIDELINES.md
│   └── MIGRATIONS.md
├── src/
│   ├── config/          # Configuration files
│   ├── controllers/     # API route handlers
│   ├── middleware/      # Express middleware
│   ├── schemas/         # API request/response schemas
│   ├── services/        # Business logic services
│   ├── storage/         # Database repositories
│   ├── types/           # TypeScript type definitions
│   ├── migrations/      # Database migrations
│   └── server.ts        # Main application entry
├── scripts/             # Utility scripts
├── Dockerfile           # Production container
├── docker-compose.yml   # Docker Compose configuration
├── knexfile.ts          # Database configuration
├── env.example          # Environment template
├── package.json         # Dependencies and scripts
└── tsconfig.json        # TypeScript configuration
```

## 🚀 Production Deployment

### Environment Variables
Ensure all required environment variables are set:
- `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` (required)
- `SUPABASE_DB_HOST`, `SUPABASE_DB_PASSWORD` (required for migrations)
- `OPENAI_API_KEY` (required)
- `MIGRATION_SECRET_KEY` (required for migration endpoints)
- `JWT_SECRET` (required for authentication)
- `DEFAULT_ADMIN_EMAIL` and `DEFAULT_ADMIN_PASSWORD` (required for initial setup)
- `NODE_ENV=production`
- `CORS_ORIGINS` (set to your domain)
- `BASE_URL` (optional, for custom Swagger server URL)

### Docker Production
```bash
# Build production image
docker build -t vezlo-server .

# Run production container
docker run -d \
  --name vezlo-server \
  -p 3000:3000 \
  --env-file .env \
  vezlo-server
```

### Health Monitoring
- Health check endpoint: `/health`
- Docker health check configured
- Logs available in `./logs/` directory

### Database Migrations in Production
```bash
# Check migration status
curl "https://your-domain.com/api/migrate/status?key=your-migration-secret-key"

# Run pending migrations
curl "https://your-domain.com/api/migrate?key=your-migration-secret-key"
```

## 🤝 Contributing

### Development Workflow
1. Fork the repository
2. Create feature branch: `git checkout -b feature/new-feature`
3. Make changes and test locally
4. Run tests: `npm test`
5. Commit: `git commit -m 'Add new feature'`
6. Push: `git push origin feature/new-feature`
7. Submit pull request

### Code Standards
- **TypeScript** - Full type safety required
- **ESLint** - Code formatting and quality
- **Prettier** - Consistent code style
- **Tests** - Unit tests for new features
- **Documentation** - Update README for API changes

### API Development
- Follow RESTful conventions
- Use proper HTTP status codes
- Include comprehensive error handling
- Update Swagger documentation
- Add request/response schemas

## 📊 Performance & Security

### Performance
- **Response Time**: Optimized for fast API responses
- **Concurrent Users**: Supports multiple concurrent users
- **Memory Usage**: Efficient memory management
- **Database**: Supabase vector operations integration

### Security Features
- **Rate Limiting** - Configurable request limits
- **CORS Protection** - Configurable origins
- **Input Validation** - Request schema validation
- **Error Handling** - Secure error responses
- **Health Monitoring** - Application logs and Docker health checks

## 📚 Documentation

- **[Developer Guidelines](docs/DEVELOPER_GUIDELINES.md)** - Development workflow, coding standards, and best practices
- **[Database Migrations](docs/MIGRATIONS.md)** - Complete guide to Knex.js migration system
- **[API Documentation](http://localhost:3000/docs)** - Interactive Swagger documentation (when running)

## 📄 License

This project is dual-licensed:

- **Non-Commercial Use**: Free under AGPL-3.0 license
- **Commercial Use**: Requires a commercial license - contact us for details

---

**Status**: ✅ Production Ready | **Version**: 2.9.0 | **Node.js**: 20+ | **TypeScript**: 5+
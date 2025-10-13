# Vezlo AI Assistant Server

🚀 **Production-ready Node.js/TypeScript API server** for the Vezlo AI Assistant platform - Complete backend APIs with Docker deployment and database migrations.

## 🏗️ Architecture

- **Backend APIs** - RESTful API endpoints for AI chat and knowledge management
- **Real-time Communication** - WebSocket support for live chat
- **Vector Search** - Supabase-powered semantic search with embeddings
- **Conversation Management** - Persistent conversation history
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

## 🚀 Quick Start (Interactive Setup)

### Prerequisites
- Node.js 20+ and npm 9+
- Supabase project (or PostgreSQL database)
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
1. **Database Configuration** - Choose Supabase or PostgreSQL
2. **OpenAI API Setup** - Configure your AI model
3. **Automatic Table Creation** - Creates all required database tables
4. **Environment File Generation** - Saves configuration to .env

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
```

#### 3. Setup Database Tables

**Option A: Automated Setup**
```bash
vezlo-setup  # Run wizard and choose option 3 to use existing .env
```

**Option B: Manual SQL**
```bash
# Copy schema to Supabase SQL Editor
cat database-schema.sql

# Then execute in Supabase Dashboard → SQL Editor
```

#### 4. Validate Setup

```bash
# Verify database connection and tables
vezlo-validate

# Or with npm
npm run validate
```

#### 5. Start Server

```bash
# If installed globally
vezlo-server

# If installed locally
npx vezlo-server

# Or from source
npm run build && npm start
```

### Docker Deployment

```bash
# Start with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f vezlo-server
```

## ☁️ Vercel Deployment

Deploy to Vercel's serverless platform with one click:

### One-Click Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vezlo/assistant-server&env=SUPABASE_URL,SUPABASE_ANON_KEY,SUPABASE_SERVICE_KEY,SUPABASE_DB_HOST,SUPABASE_DB_PORT,SUPABASE_DB_NAME,SUPABASE_DB_USER,SUPABASE_DB_PASSWORD,OPENAI_API_KEY,MIGRATION_SECRET_KEY&envDescription=Required%20environment%20variables&envLink=https://github.com/vezlo/assistant-server/blob/main/env.example)

This will:
- Fork the repository to your GitHub
- Create a Vercel project
- Prompt for required environment variables
- Deploy automatically

### Manual Vercel Deploy

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Follow prompts to configure
```

### Prerequisites for Vercel

1. **Setup Database First**: Run `vezlo-setup` locally or execute `database-schema.sql` in Supabase
2. **Get Credentials**: Collect Supabase and OpenAI credentials
3. **Configure Environment Variables** in Vercel project settings

See [docs/VERCEL_DEPLOYMENT.md](docs/VERCEL_DEPLOYMENT.md) for detailed deployment guide.

## 🔧 Environment Configuration

Edit `.env` file with your credentials:

```bash
# REQUIRED - Supabase Configuration
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-anon-key
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

# OPTIONAL - Server Configuration
PORT=3000
NODE_ENV=production
LOG_LEVEL=info

# OPTIONAL - CORS Configuration
CORS_ORIGINS=http://localhost:3000,http://localhost:5173

# OPTIONAL - Rate Limiting
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX=100

# OPTIONAL - Organization Settings
ORGANIZATION_NAME=Vezlo
ASSISTANT_NAME=Vezlo Assistant

# OPTIONAL - Feature Flags
ENABLE_CACHE=true
ENABLE_VOICE=true
ENABLE_GITHUB_SYNC=true
ENABLE_HUMAN_HANDOFF=true

# OPTIONAL - Knowledge Base
CHUNK_SIZE=1000
CHUNK_OVERLAP=200
```

## 🔧 CLI Commands

The package provides these command-line tools:

### vezlo-setup
**Interactive setup wizard** that guides you through the complete configuration process. This CLI tool provides the same functionality as the web-based setup wizard but runs in your terminal.

```bash
vezlo-setup
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
- `POST /api/conversations` - Create new conversation
- `GET /api/conversations/:uuid` - Get conversation with messages
- `DELETE /api/conversations/:uuid` - Delete conversation
- `GET /api/users/:uuid/conversations` - Get user conversations

#### Messages
- `POST /api/conversations/:uuid/messages` - Create user message
- `POST /api/messages/:uuid/generate` - Generate AI response

#### Knowledge Base
- `POST /api/knowledge/items` - Create knowledge item
- `GET /api/knowledge/items` - List knowledge items
- `GET /api/knowledge/items/:uuid` - Get knowledge item
- `PUT /api/knowledge/items/:uuid` - Update knowledge item
- `DELETE /api/knowledge/items/:uuid` - Delete knowledge item

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
- `POST /api/feedback` - Submit message feedback

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

Run the SQL schema in your Supabase SQL Editor:

```bash
# Copy the database schema file
cp database-schema.sql /path/to/your/supabase/sql-editor
```

The `database-schema.sql` file contains all necessary tables and functions:
- **conversations** - Chat conversation management
- **messages** - Individual messages within conversations  
- **message_feedback** - User feedback on messages
- **knowledge_items** - Knowledge base items with vector embeddings
- **match_knowledge_items()** - Vector similarity search function

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

# Start development server
npm run dev

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
- `NODE_ENV=production`
- `CORS_ORIGINS` (set to your domain)

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

**Status**: ✅ Production Ready | **Version**: 1.3.0 | **Node.js**: 20+ | **TypeScript**: 5+
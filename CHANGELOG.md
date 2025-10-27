# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2024-01-XX

### 🚨 BREAKING CHANGES

This is a major release that introduces multi-tenancy support. **Existing data will not be migrated automatically.**

#### Migration Required
- **Database Schema**: New tables added (`companies`, `users`, `user_company_profiles`, `api_keys`)
- **Authentication**: JWT-based authentication now required for all API endpoints
- **Data Structure**: Foreign key relationships changed to support multi-tenancy
- **API Changes**: Request/response schemas updated to remove explicit UUIDs

#### What Changed
- **Multi-Tenancy**: Full support for multiple companies and users
- **Authentication**: JWT-based login/logout system with role-based access control
- **User Types**: Support for internal, external, and admin users
- **API Keys**: Company-scoped API key authentication for external integrations
- **Data Isolation**: All data is now properly isolated by company

### ✨ Added
- **Authentication System**
  - JWT-based login/logout endpoints (`/api/auth/login`, `/api/auth/logout`)
  - User profile management (`/api/auth/me`)
  - Token refresh mechanism (`/api/auth/refresh`)
  - Password hashing with bcrypt

- **Multi-Tenancy Support**
  - Companies table with domain-based identification
  - User-company profiles for role management
  - API keys for service-to-service communication
  - Row-level security policies

- **User Management**
  - User types: internal, external, admin
  - Multi-company user support
  - Role-based access control (admin, user, viewer)

- **Setup Tools**
  - `npm run seed-default` - Initialize default company and admin user
  - Integrated into interactive setup wizard

### 🔄 Changed
- **Database Schema**
  - Added `user_type` field to users table
  - Changed foreign key relationships to use `user_id` + `company_id` instead of profile IDs
  - Updated all existing tables with new foreign key structure

- **API Endpoints**
  - All endpoints now require authentication
  - Removed explicit `user_uuid` and `company_uuid` from request bodies
  - Context derived from authenticated user's JWT token

- **Authentication Flow**
  - Login returns access token, refresh token, and user profile
  - Logout invalidates all user tokens via `token_updated_at` timestamp
  - Multi-company users can switch between companies

### 🗑️ Removed
- **Data Migration**: No automatic migration of existing data
- **Setup API**: Moved to command-line setup script
- **Legacy Fields**: Removed explicit UUID fields from API schemas
- **Export Tools**: Removed data export functionality

### 📋 Migration Guide

#### For Existing Users (v1.x → v2.0)

1. **Upgrade Package**
   ```bash
   npm install @vezlo/assistant-server@latest
   ```

2. **Run Migrations**
   ```bash
   npm run migrate:latest
   ```

3. **Setup Default Data**
   ```bash
   npm run seed-default
   ```

4. **Update Your Code**
   - Add authentication headers to all API calls
   - Remove explicit UUID parameters from requests
   - Handle new response formats

#### Environment Variables
Add these to your `.env` file:
```bash
JWT_SECRET=your-super-secret-jwt-key
DEFAULT_ADMIN_EMAIL=admin@yourcompany.com
DEFAULT_ADMIN_PASSWORD=your-secure-password
```

### 🔧 Technical Details

#### New Database Tables
- `companies` - Company information and domains
- `users` - User accounts with type classification
- `user_company_profiles` - User-company relationships and roles
- `api_keys` - Company-scoped API keys for integrations

#### Updated Tables
- `vezlo_conversations` - Added `creator_user_id` and `company_id`
- `vezlo_knowledge_items` - Added `created_by_user_id` and `company_id`
- `vezlo_message_feedback` - Added `user_id` and `company_id`

#### Authentication Flow
1. User logs in with email/password
2. System validates credentials and returns JWT tokens
3. All subsequent requests include JWT in Authorization header
4. System validates token and extracts user/company context
5. Data access is automatically filtered by company

---

## [1.4.0] - 2024-01-XX

### Added
- Initial release with single-tenant support
- Conversation management
- Knowledge base functionality
- Message feedback system
- Vector search capabilities

### Changed
- Various improvements and bug fixes

### Fixed
- Various bug fixes and performance improvements

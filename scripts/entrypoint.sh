#!/bin/sh

# Migration runner script for Docker
# This script runs database migrations before starting the application

set -e

echo ""
echo "============================================"
echo "🚀 Starting Vezlo Server Initialization Flow"
echo "============================================"
echo ""

# Ensure production environment for migrations (uses compiled .js files)
export NODE_ENV=${NODE_ENV:-production}

# Wait for database to be ready (optional)
echo "🔌 Waiting for database connection..."
sleep 2

# Run migrations
echo ""
echo "--------------------------------------------"
echo "📦 Step 1: Running Database Migrations"
echo "--------------------------------------------"
npm run migrate:latest

# Give Supabase/DB cache time to refresh after migrations
echo "⏳ Allowing schema changes to propagate..."
sleep 5

# Seed default data (idempotent)
echo ""
echo "--------------------------------------------"
echo "🌱 Step 2: Seeding Default Data"
echo "--------------------------------------------"
if npm run seed-default; then
  echo "🎉 Default data seed completed."
else
  echo "⚠️  Seed step failed or data already exists. Continuing startup..."
fi

# Generate API key (idempotent)
echo ""
echo "--------------------------------------------"
echo "🔑 Step 3: Generating Default API Key"
echo "--------------------------------------------"
if npm run generate-key; then
  echo "🎯 API key generation step completed."
else
  echo "⚠️  API key generation skipped or failed. Continuing startup..."
fi

# Start the application
echo ""
echo "============================================"
echo "✅ Initialization steps completed. Launching app..."
echo "============================================"
echo ""
exec "$@"


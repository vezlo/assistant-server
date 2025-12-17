# Slack Integration Guide

## Overview

The Vezlo assistant-server supports direct Slack integration, allowing users to query the knowledge base directly from Slack without leaving their workspace.

## Features

- **App Mentions**: Tag the bot in any channel to query the knowledge base
- **Direct Messages**: Send private queries via DM
- **Slash Commands**: Use `/vezlo` command for quick queries
- **Threaded Responses**: Keeps conversations organized

## Setup

### 1. Create Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click "Create New App" → "From scratch"
3. Enter app name (e.g., "Vezlo Assistant")
4. Select your workspace
5. Click "Create App"

### 2. Configure Bot Features

#### Enable Bot User
1. Go to "OAuth & Permissions" in sidebar
2. Scroll to "Scopes" → "Bot Token Scopes"
3. Add the following scopes:
   - `app_mentions:read` - Read messages that mention the bot
   - `chat:write` - Send messages as the bot
   - `im:history` - View direct messages
   - `im:read` - Read direct messages
   - `reactions:write` - Add/remove emoji reactions (for processing indicators)

#### Enable Event Subscriptions
1. Go to "Event Subscriptions" in sidebar
2. Toggle "Enable Events" to On
3. Enter Request URL: `https://your-server.com/api/slack/events`
   - Replace `your-server.com` with your actual server URL
   - Slack will verify this URL (must return 200 with challenge)
4. Under "Subscribe to bot events", add:
   - `app_mention` - When bot is mentioned
   - `message.im` - Direct messages to bot

#### Add Slash Command (Optional)
1. Go to "Slash Commands" in sidebar
2. Click "Create New Command"
3. Enter:
   - Command: `/vezlo`
   - Request URL: `https://your-server.com/api/slack/commands`
   - Short Description: "Query Vezlo knowledge base"
   - Usage Hint: `search [your query]`
4. Click "Save"

### 3. Install App to Workspace

1. Go to "OAuth & Permissions"
2. Click "Install to Workspace"
3. Review permissions and click "Allow"
4. Copy the "Bot User OAuth Token" (starts with `xoxb-`)

### 4. Get Signing Secret

1. Go to "Basic Information" in sidebar
2. Scroll to "App Credentials"
3. Copy the "Signing Secret"

### 5. Configure Assistant Server

Add these environment variables to your `.env` file:

```bash
SLACK_BOT_TOKEN=xoxb-your-bot-token-here
SLACK_SIGNING_SECRET=your-signing-secret-here
```

Restart your assistant-server:

```bash
npm start
# or
docker-compose up -d
```

### 6. Invite Bot to Channels

In Slack, invite the bot to channels where you want to use it:

```
/invite @VezloAssistant
```

## Usage

### App Mentions

In any channel where the bot is present:

```
@VezloAssistant search authentication
@VezloAssistant how does user login work?
```

**Visual feedback:**
- ⏳ Hourglass appears while processing
- ✅ Checkmark appears when done
- ❌ X appears on error

### Direct Messages

Send a DM to the bot:

```
search payment integration
how to implement password reset?
```

### Slash Commands

Use the slash command (if configured):

```
/vezlo search authentication
/vezlo how does routing work?
```

## Response Format

The bot will generate AI-powered responses using the same flow as the widget:

1. **Creates conversation** (or reuses existing thread conversation)
2. **Saves user message** to database
3. **Generates AI response** using knowledge base context
4. **Returns complete response** (buffered, not streamed)

Example response:

```
Based on the authentication implementation in your codebase, here's how it works:

The authentication system uses JWT tokens for user verification. When a user logs in:

1. The login function validates email and password using bcrypt
2. If successful, a JWT token is generated and signed
3. Subsequent requests include this token in headers
4. The authenticateUser function verifies the token

The main files handling this are auth.js and login.js.
```

## Troubleshooting

### Slack URL Verification Fails

**Problem**: Slack cannot verify your webhook URL

**Solutions**:
- Ensure your server is publicly accessible (not localhost)
- Check that `/api/slack/events` endpoint is responding
- Verify environment variables are set correctly
- Check server logs for errors

### Bot Not Responding

**Problem**: Bot doesn't respond to mentions or DMs

**Solutions**:
- Verify `SLACK_BOT_TOKEN` is correct
- Check bot is invited to the channel
- Ensure Event Subscriptions are enabled
- Check server logs for webhook errors

### Permission Errors

**Problem**: Bot says "Permission denied" or similar

**Solutions**:
- Verify all required scopes are added
- Reinstall the app to workspace
- Check bot has access to the channel

### Rate Limiting

**Problem**: Bot stops responding after many requests

**Solutions**:
- Slack has rate limits (1+ requests per second)
- Server implements automatic retry with backoff
- Consider reducing query frequency

## Security

### Signature Verification

All Slack webhooks are verified using the signing secret to prevent unauthorized requests.

### Data Privacy

- Bot only accesses messages where it's mentioned or DMs
- No message content is stored (only queries)
- Knowledge base data remains secure

## Limitations

- Slack message size limit: ~40KB per message
- Long responses are automatically chunked
- No streaming responses (Slack doesn't support SSE)
- Responses are buffered and sent as complete messages

## Advanced Configuration

### Custom Response Format

Edit `SlackController.ts` → `formatSearchResults()` method to customize response formatting.

### Rate Limiting

Default rate limits are handled automatically. To adjust:

Edit `SlackService.ts` → `sendMessageInChunks()` method to change delay between chunks.

## Support

For issues or questions:
- Check server logs: `docker logs vezlo-assistant-server` or `npm run logs`
- Review Slack app event logs at api.slack.com/apps
- Open an issue on GitHub

## Example Workflow

1. **PM asks in Slack**: `@VezloBot does our code support OAuth?`
2. **Bot searches KB**: Queries knowledge base for OAuth-related code
3. **Bot responds**: Shows relevant code snippets and documentation
4. **PM validates**: Reviews code and confirms implementation
5. **Team collaborates**: Other team members can see and discuss in thread

This integration enables PMs to validate project steps against actual code without leaving Slack, improving efficiency and accuracy.


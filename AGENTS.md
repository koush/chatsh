# AGENTS.md

## Project Overview

`@koush/chatsh` - A terminal-based shell assistant that connects shell sessions to LLMs for context-aware help.

## Architecture

### Core Components

**`src/main.ts`** - Single entry point containing:
- PTY spawning (using `@scrypted/node-pty`)
- HTTP server for LLM queries
- Transcript tracking with clear detection
- LLM provider abstraction (using Vercel AI SDK)

### Key Features

1. **PTY Wrapper**: Spawns an interactive shell (zsh/bash/fish) in a pseudo-terminal
2. **Transcript**: Records all terminal output; resets on `clear` command (ANSI `\x1b[2J`)
3. **HTTP Server**: Runs on random port, passed to shell via `CHATSH_PORT` env var
4. **LLM Integration**: Uses Vercel AI SDK with support for OpenAI, Anthropic, Google, and OpenAI-compatible endpoints

### Shell Function

The `help` function is injected into the shell on startup:
```bash
help() { curl -s -X POST -d "$*" http://localhost:$CHATSH_PORT }
```

POST body is the user's question; transcript is sent to LLM as context.

### Configuration

Config file located at `~/.chatsh/chatsh.jsonc` - JSON with comments support.

### Key Dependencies

- `@scrypted/node-pty` - PTY spawning
- `ai` + `@ai-sdk/*` - Vercel AI SDK for LLM abstraction
- `jsonc-parser` - Parse JSON with comments

## Build

```bash
npm run build  # Compiles TypeScript to dist/
```

## Publish

```bash
npm publish  # prepublishOnly hook bumps version and builds
```

## Notes

- zsh requires explicit `bindkey` for Ctrl+R reverse search to work in PTY
- Raw mode on stdin required for proper keyboard input handling
- Transcript detection of terminal clear uses ANSI escape sequence `\x1b[2J`

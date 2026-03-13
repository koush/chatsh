# @koush/chatsh

A terminal-based shell assistant that connects your shell session to an LLM for context-aware help.

## What it does

Chatsh wraps your shell session and maintains a transcript of all terminal activity. Use the `help` command to query an LLM with context about what you're doing.

```
$ help how do I find large files?
```

The LLM receives your entire shell transcript and can provide context-aware assistance.

## Features

- **Shell wrapper** - Wraps zsh/bash/fish in a PTY session
- **LLM integration** - Multiple provider support (OpenAI, Anthropic, Google, OpenAI-compatible)
- **Transcript tracking** - Maintains full terminal history
- **Smart clear detection** - Resets transcript on terminal clear

## Installation

```bash
npm install -g @koush/chatsh
```

Or run directly with:

```bash
npx @koush/chatsh
```

## Configuration

Create `~/.chatsh/chatsh.jsonc`:

```jsonc
// OpenAI
{
  "provider": "openai",
  "model": "gpt-4-turbo",
  "options": {
    "apiKey": "sk-..."  // or set OPENAI_API_KEY env var
  }
}

// Anthropic (Claude)
{
  "provider": "anthropic",
  "model": "claude-sonnet-4-5",
  "options": {
    "apiKey": "sk-ant-..."  // or set ANTHROPIC_API_KEY env var
  }
}

// Google (Gemini)
{
  "provider": "google",
  "model": "gemini-2.5-flash",
  "options": {
    "apiKey": "..."  // or set GOOGLE_GENERATIVE_AI_API_KEY env var
  }
}

// OpenAI-Compatible (Custom Endpoint)
{
  "provider": "openai-compatible",
  "model": "your-model-name",
  "options": {
    "name": "custom",
    "baseURL": "http://localhost:8000/v1",
    "apiKey": "your-api-key"
  }
}
```

## Usage

Start chatsh:

```bash
chatsh
```

Use your shell normally. When you need help:

```bash
$ ls /nonexistent
ls: /nonexistent: No such file or directory
$ help why did this command fail?
```

## How it works

1. Spawns an interactive shell in a pseudo-terminal (PTY)
2. Starts a local HTTP server on a random port
3. Tracks all terminal output in a transcript
4. The `help` command sends the transcript + your question to an LLM
5. LLM response streams back to your terminal

## License

ISC

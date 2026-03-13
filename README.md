# @koush/chatsh

A terminal-based shell assistant that connects your shell session to an LLM for context-aware help.

## Quick Start

```bash
$ npx @koush/chatsh
$ ls /nonexistent
ls: /nonexistent: No such file or directory

$ help why did this command fail?

The command failed because the directory /nonexistent does not exist. 
The ls command lists directory contents, but it cannot find a path 
that doesn't exist on your filesystem. Try ls without arguments to 
see your current directory, or use ls / to list the root directory.

```

The LLM sees your entire terminal transcript and provides context-aware assistance.

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

## Features

- Wraps zsh/bash/fish in a PTY session
- Multiple LLM providers (OpenAI, Anthropic, Google, OpenAI-compatible)
- Maintains full terminal history
- Resets transcript on terminal clear

## How it works

1. Spawns an interactive shell in a pseudo-terminal (PTY)
2. Starts a local HTTP server on a random port
3. Tracks all terminal output in a transcript
4. The `help` command sends the transcript + your question to an LLM
5. LLM response streams back to your terminal

## License

ISC

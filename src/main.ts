import { spawn } from '@scrypted/node-pty';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import * as jsonc from 'jsonc-parser';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { streamText } from 'ai';

type ProviderType = 'openai' | 'anthropic' | 'google' | 'openai-compatible';

interface ChatshConfig {
  provider: ProviderType;
  model: string;
  options?: {
    apiKey?: string;
    baseURL?: string;
    name?: string;
    organization?: string;
    project?: string;
  };
}

const CONFIG_PATH = join(homedir(), '.chatsh', 'chatsh.jsonc');

function loadConfig(): ChatshConfig | null {
  if (!existsSync(CONFIG_PATH)) {
    return null;
  }

  try {
    const content = readFileSync(CONFIG_PATH, 'utf-8');
    const config = jsonc.parse(content) as ChatshConfig;
    
    if (!config.provider || !config.model) {
      return null;
    }

    const validProviders: ProviderType[] = ['openai', 'anthropic', 'google', 'openai-compatible'];
    if (!validProviders.includes(config.provider)) {
      return null;
    }

    return config;
  } catch {
    return null;
  }
}

function showConfigHelp(): void {
  console.error(`Error: No valid config found at ${CONFIG_PATH}

Create a config file at ~/.chatsh/chatsh.jsonc with one of the following formats:

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
  "model": "glm-4.7",
  "options": {
    "name": "custom",
    "baseURL": "http://localhost:8000/v1",
    "apiKey": "your-api-key"
  }
}
`);
}

function getEnvApiKey(provider: string): string | undefined {
  switch (provider) {
    case 'openai':
      return process.env.OPENAI_API_KEY;
    case 'anthropic':
      return process.env.ANTHROPIC_API_KEY;
    case 'google':
      return process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    default:
      return undefined;
  }
}

function createProvider(config: ChatshConfig) {
  const { provider, model, options = {} } = config;
  const apiKey = options.apiKey || getEnvApiKey(provider);
  const baseURL = options.baseURL;

  switch (provider) {
    case 'openai': {
      return {
        model: createOpenAI({
          apiKey,
          baseURL,
          organization: options.organization,
          project: options.project,
        })(model),
      };
    }

    case 'anthropic': {
      return {
        model: createAnthropic({
          apiKey,
          baseURL,
        })(model),
      };
    }

    case 'google': {
      return {
        model: createGoogleGenerativeAI({
          apiKey,
          baseURL,
        })(model),
      };
    }

    case 'openai-compatible': {
      return {
        model: createOpenAICompatible({
          name: options.name || 'custom',
          apiKey,
          baseURL: baseURL || 'http://localhost:8000/v1',
        })(model),
      };
    }

    default: {
      throw new Error(`Unknown provider: ${provider}`);
    }
  }
}

async function main() {
  const config = loadConfig();
  
  if (!config) {
    showConfigHelp();
    process.exit(1);
  }

  const { model } = createProvider(config);
  let transcript = '';

  const server = createServer((req, res) => {
    if (req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => body += chunk);
      req.on('end', async () => {
        try {
          const result = streamText({
            model,
            system: 'You are a helpful assistant running in a terminal session. You receive a shell transcript from the user and an associated user query, if any.\n\nCRITICAL: Do NOT use any markdown formatting whatsoever. This means:\n- No bullet points (- or *)\n- No backticks (`) for code\n- No headers (#)\n- No bold/italic markers (** or _)\n- No markdown links\n\nUse plain text only. If you need to emphasize something or format code examples, use ANSI escape codes instead (e.g., \\x1b[1m for bold, \\x1b[32m for green, \\x1b[0m to reset).\n\nHelp the user based on the transcript context.',
            prompt: `${transcript}\n\n${body}`
          });

          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.write('\n\n');
          for await (const chunk of result.textStream) {
            res.write(chunk);
          }
          res.write('\n\n');
          res.end();
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Error: ' + (error as Error).message);
        }
      });
    } else {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(transcript);
    }
  });
  server.listen(0);
  await once(server, 'listening');
  const address = server.address();
  const port = address && typeof address === 'object' ? address.port : 0;

  const shell = process.env.SHELL || '/bin/zsh';
  const ptyProcess = spawn(shell, ['-i'], {
    name: process.env.TERM || 'xterm',
    cols: process.stdout.columns || 80,
    rows: process.stdout.rows || 24,
    cwd: process.cwd(),
    env: { ...process.env, CHATSH_PORT: String(port) } as { [key: string]: string }
  });

  process.stdin.setRawMode(true);
  process.stdin.resume();

  process.stdin.on('data', (data: Buffer) => {
    ptyProcess.write(data as any);
  });

  ptyProcess.onData((data: string) => {
    const clearSeq = '\x1b[2J';
    const lastClearIndex = data.lastIndexOf(clearSeq);
    
    if (lastClearIndex !== -1) {
      transcript = '';
      const afterClear = data.slice(lastClearIndex + clearSeq.length);
      transcript += afterClear.replace(/^\x1b\[H/, '');
    } else {
      transcript += data;
    }
    process.stdout.write(data);
  });

  ptyProcess.write('help() { curl -s -X POST -d "$*" http://localhost:$CHATSH_PORT }\n');
  if (shell.includes('zsh')) {
    ptyProcess.write('bindkey "^R" history-incremental-search-backward\n');
  }

  ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
    process.exit(exitCode);
  });

  process.on('exit', () => {
    ptyProcess.kill();
  });

  process.stdout.on('resize', () => {
    ptyProcess.resize(process.stdout.columns || 80, process.stdout.rows || 24);
  });
}

main();

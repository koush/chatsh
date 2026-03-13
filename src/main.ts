import { spawn } from '@scrypted/node-pty';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as jsonc from 'jsonc-parser';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { streamText } from 'ai';

const __filename = fileURLToPath(import.meta.url);

function createEscapeConverter() {
  let buffer = '';
  const patterns = ['\\033[', '\\x1b[', '\\e[', '\\u001b['];
  
  return {
    convert(chunk: string): string {
      buffer += chunk;
      let result = '';
      
      for (const pattern of patterns) {
        while (buffer.includes(pattern)) {
          const idx = buffer.indexOf(pattern);
          result += buffer.substring(0, idx);
          result += '\x1b[';
          buffer = buffer.substring(idx + pattern.length);
        }
      }
      
      // Keep potential partial matches in buffer
      let safeIdx = buffer.length;
      for (const pattern of patterns) {
        const partialMatch = pattern.substring(0, pattern.length - 1);
        if (buffer.endsWith(partialMatch)) {
          safeIdx = Math.min(safeIdx, buffer.length - partialMatch.length);
        }
      }
      
      result += buffer.substring(0, safeIdx);
      buffer = buffer.substring(safeIdx);
      
      return result;
    },
    flush(): string {
      const remaining = buffer;
      buffer = '';
      return remaining;
    }
  };
}

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
            system: 'You are a helpful assistant running in a terminal session. You receive a shell transcript from the user and an associated user query, if any.\n\nCRITICAL: Do NOT use any markdown formatting whatsoever. This means:\n- No bullet points (- or *)\n- No backticks (`) for code\n- No headers (#)\n- No bold/italic markers (** or _)\n- No markdown links\n\nUse plain text only. When you need to emphasize something or format output, use ANSI escape codes. They WILL be converted and rendered properly in the terminal:\n\nWrite escape codes using \\033 notation:\n- \\033[1m for bold\n- \\033[32m for green\n- \\033[31m for red\n- \\033[33m for yellow\n- \\033[34m for blue\n- \\033[36m for cyan\n- \\033[35m for magenta\n- \\033[0m to reset formatting\n\nExample: To print "Hello" in green, write: \\033[32mHello\\033[0m\n\nThe escape codes will be automatically converted and rendered as colors in the terminal.\n\nHelp the user based on the transcript context.',
            prompt: `${transcript}\n\n${body}`
          });

          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.write('\n\n');
          const converter = createEscapeConverter();
          for await (const chunk of result.textStream) {
            res.write(converter.convert(chunk));
          }
          res.write(converter.flush());
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
    env: {
      ...process.env,
      CHATSH_PORT: String(port),
      CHATSH_NODE: process.execPath,
      CHATSH_SCRIPT: __filename,
      CHATSH_TS: __filename.endsWith('.ts') ? '--experimental-strip-types' : ''
    } as { [key: string]: string }
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

  ptyProcess.write('help() { "$CHATSH_NODE" --no-warnings $CHATSH_TS "$CHATSH_SCRIPT" --help "$*"; }\n');
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

// Handle --help flag for shell help command
if (process.argv[2] === '--help') {
  const query = process.argv.slice(3).join(' ');
  const port = process.env.CHATSH_PORT;
  
  if (!port) {
    console.error('CHATSH_PORT not set');
    process.exit(1);
  }
  
  const response = await fetch(`http://localhost:${port}`, {
    method: 'POST',
    body: query
  });
  
  for await (const chunk of response.body as AsyncIterable<Uint8Array>) {
    process.stdout.write(chunk);
  }
  process.exit(0);
} else {
  main();
}

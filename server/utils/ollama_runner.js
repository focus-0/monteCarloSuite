/**
 * Local Ollama Daemon & Gemma Model Auto-Runner
 * Automatically detects if Ollama is running; if not, attempts to spawn `ollama serve`.
 * Auto-discovers installed Gemma models from /api/tags for zero-config local execution.
 */

const { spawn, execSync } = require('child_process');
const http = require('http');
const config = require('../config');

let isSpawningOllama = false;
let detectedGemmaModel = null;

/**
 * Ping Ollama HTTP endpoint
 */
async function checkOllamaHealth(url = config.ollama.url, timeoutMs = 1500) {
  return new Promise((resolve) => {
    try {
      const u = new URL(url);
      const req = http.request(
        {
          hostname: u.hostname,
          port: u.port || 11434,
          path: '/api/tags',
          method: 'GET',
          timeout: timeoutMs
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            if (res.statusCode === 200) {
              try {
                const parsed = JSON.parse(data);
                resolve({ running: true, tags: parsed.models || [] });
              } catch {
                resolve({ running: true, tags: [] });
              }
            } else {
              resolve({ running: false, tags: [] });
            }
          });
        }
      );

      req.on('error', () => resolve({ running: false, tags: [] }));
      req.on('timeout', () => {
        req.destroy();
        resolve({ running: false, tags: [] });
      });
      req.end();
    } catch {
      resolve({ running: false, tags: [] });
    }
  });
}

/**
 * Try to start Ollama daemon if on a local machine
 */
async function startOllamaDaemon() {
  if (isSpawningOllama) return;
  isSpawningOllama = true;

  try {
    // Check if ollama CLI is installed
    let ollamaBin = 'ollama';
    try {
      execSync('which ollama', { stdio: 'pipe' });
    } catch {
      // Check standard Homebrew / Linux locations
      const paths = ['/opt/homebrew/bin/ollama', '/usr/local/bin/ollama', '/usr/bin/ollama'];
      const fs = require('fs');
      for (const p of paths) {
        if (fs.existsSync(p)) {
          ollamaBin = p;
          break;
        }
      }
    }

    console.log(`[Ollama Auto-Runner] Attempting to start '${ollamaBin} serve'...`);
    const child = spawn(ollamaBin, ['serve'], {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();

    // Wait up to 3 seconds for it to become ready
    for (let i = 0; i < 6; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const health = await checkOllamaHealth();
      if (health.running) {
        console.log('[Ollama Auto-Runner] Ollama daemon is now online.');
        isSpawningOllama = false;
        return health;
      }
    }
  } catch (err) {
    console.warn('[Ollama Auto-Runner] Could not auto-start ollama serve:', err.message);
  } finally {
    isSpawningOllama = false;
  }
}

/**
 * Ensure Ollama is running and discover best Gemma model tag.
 */
async function ensureOllamaRunning() {
  let health = await checkOllamaHealth();

  if (!health.running && config.nodeEnv !== 'production') {
    await startOllamaDaemon();
    health = await checkOllamaHealth();
  }

  if (health.running && health.tags?.length) {
    const installedNames = health.tags.map((m) => m.name || m.model || '');
    const configured = config.ollama.model;

    // Check if exact configured model exists
    if (installedNames.some((n) => n === configured || n.startsWith(configured))) {
      detectedGemmaModel = configured;
      return { running: true, model: detectedGemmaModel, tags: installedNames };
    }

    // Auto-discover Gemma variants: gemma2:9b, gemma4:12b, gemma2, gemma:7b, gemma2:2b, etc.
    const gemmaMatch = installedNames.find(
      (n) => n.toLowerCase().includes('gemma') || n.toLowerCase().includes('llama')
    );
    if (gemmaMatch) {
      detectedGemmaModel = gemmaMatch;
      return { running: true, model: detectedGemmaModel, tags: installedNames };
    }
  }

  return {
    running: health.running,
    model: detectedGemmaModel || config.ollama.model,
    tags: health.tags || []
  };
}

function getActiveOllamaModel() {
  return detectedGemmaModel || config.ollama.model;
}

module.exports = {
  checkOllamaHealth,
  ensureOllamaRunning,
  getActiveOllamaModel
};

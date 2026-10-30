import express from 'express';
import cors from 'cors';
import { spawn } from 'child_process';
import { dbApi } from './db.js';
import fs from 'fs';
import path from 'path';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ==================== Agy Session Stats ====================
const serverStartTime = Date.now();

interface AgySessionStats {
  totalRequests: number;
  activeRequests: number;
  totalTokensIn: number;
  totalTokensOut: number;
  totalRetries: number;
  errors: number;
  lastRequestAt: number | null;
  sessionsByProject: Record<string, {
    conversationId: string | null;
    requestCount: number;
    lastModel: string;
    lastRequestAt: number;
  }>;
}

const agyStats: AgySessionStats = {
  totalRequests: 0,
  activeRequests: 0,
  totalTokensIn: 0,
  totalTokensOut: 0,
  totalRetries: 0,
  errors: 0,
  lastRequestAt: null,
  sessionsByProject: {},
};

function formatUptime(ms: number): string {
  const secs = Math.floor(ms / 1000);
  const mins = Math.floor(secs / 60);
  const hrs = Math.floor(mins / 60);
  if (hrs > 0) return `${hrs}h ${mins % 60}m ${secs % 60}s`;
  if (mins > 0) return `${mins}m ${secs % 60}s`;
  return `${secs}s`;
}

function logAgyStats() {
  const now = Date.now();
  const uptime = formatUptime(now - serverStartTime);
  const projects = dbApi.listProjects() as any[];
  const activeSessions = projects.filter((p: any) => p.agy_conversation_id).length;
  const lastAgo = agyStats.lastRequestAt ? formatUptime(now - agyStats.lastRequestAt) : 'never';

  console.log(`[agy] stats | uptime=${uptime}, requests=${agyStats.totalRequests}, active=${agyStats.activeRequests}, retries=${agyStats.totalRetries}, errors=${agyStats.errors}, tokens_in=${agyStats.totalTokensIn}, tokens_out=${agyStats.totalTokensOut}, total_tokens=${agyStats.totalTokensIn + agyStats.totalTokensOut}, sessions=${activeSessions}/${projects.length}, last_request=${lastAgo}`);
}

// Log stats every 5 minutes
setInterval(logAgyStats, 5 * 60 * 1000);

// ==================== Projects ====================

// List all projects
app.get('/api/projects', (_req, res) => {
  try {
    const projects = dbApi.listProjects();
    res.json(projects);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get a full project with all nodes
app.get('/api/projects/:id', (req, res) => {
  try {
    const project = dbApi.getFullProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json(project);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create a project
app.post('/api/projects', (req, res) => {
  try {
    const { id, name } = req.body;
    const project = dbApi.createProject(id, name);
    res.status(201).json(project);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Rename a project
app.patch('/api/projects/:id/rename', (req, res) => {
  try {
    const { name } = req.body;
    const project = dbApi.renameProject(req.params.id, name);
    res.json(project);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Set active node
app.patch('/api/projects/:id/active-node', (req, res) => {
  try {
    const { nodeId } = req.body;
    dbApi.setActiveNode(req.params.id, nodeId);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a project
app.delete('/api/projects/:id', (req, res) => {
  try {
    dbApi.deleteProject(req.params.id);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== Nodes ====================

// Create a node
app.post('/api/projects/:projectId/nodes', (req, res) => {
  try {
    const { id, label, prompt, parentId, images } = req.body;
    const node = dbApi.createNode(id, req.params.projectId, label, prompt, parentId, images);

    // If this is the first node, set it as root
    const project = dbApi.getProject(req.params.projectId) as any;
    if (!project.root_node_id) {
      dbApi.setRootNode(req.params.projectId, id);
    }

    // Set as active node
    dbApi.setActiveNode(req.params.projectId, id);

    res.status(201).json(node);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update node response (for streaming — called when stream completes)
app.patch('/api/nodes/:id/response', (req, res) => {
  try {
    const { response, status } = req.body;
    dbApi.updateResponse(req.params.id, response, status || 'complete');
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update node token usage
app.patch('/api/nodes/:id/usage', (req, res) => {
  try {
    const { tokensIn, tokensOut } = req.body;
    dbApi.updateUsage(req.params.id, tokensIn || 0, tokensOut || 0);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update node label
app.patch('/api/nodes/:id/label', (req, res) => {
  try {
    const { label } = req.body;
    dbApi.updateLabel(req.params.id, label);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update node status
app.patch('/api/nodes/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    dbApi.updateStatus(req.params.id, status);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a node and its subtree
app.delete('/api/projects/:projectId/nodes/:id', (req, res) => {
  try {
    const { projectId, id } = req.params;

    // Get node before deleting to check parentId
    const node = dbApi.getNode(id) as any;
    if (!node) return res.status(404).json({ error: 'Node not found' });

    const deleted = dbApi.deleteNodeTree(id, projectId);

    // If root was deleted, clear root
    const project = dbApi.getProject(projectId) as any;
    if (project && deleted.has(project.root_node_id)) {
      dbApi.setRootNode(projectId, '');
    }

    // Move active to parent if active was deleted
    if (project && deleted.has(project.active_node_id)) {
      dbApi.setActiveNode(projectId, node.parent_id || null);
    }

    res.json({ ok: true, deleted: Array.from(deleted) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Compress a branch
app.post('/api/projects/:projectId/nodes/:id/compress', (req, res) => {
  try {
    const { projectId, id } = req.params;
    const { summary } = req.body;

    // Delete all children
    const allNodes = dbApi.getProjectNodes(projectId) as any[];
    const children = allNodes.filter((n) => n.parent_id === id);

    for (const child of children) {
      dbApi.deleteNodeTree(child.id, projectId);
    }

    // Update this node
    dbApi.updateResponse(id, summary, 'complete');
    dbApi.updateLabel(id, '📦 ' + ((dbApi.getNode(id) as any)?.label || ''));

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== Image Upload ====================

// Ensure uploads directory exists (inside workspace so agy can view them)
const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// POST /api/upload — save base64 images to disk, return file paths
app.post('/api/upload', (req, res) => {
  const { images } = req.body; // Array of { data: base64, mimeType: string }

  if (!images || !Array.isArray(images) || images.length === 0) {
    return res.status(400).json({ error: 'images array is required' });
  }

  try {
    const savedPaths: string[] = [];

    for (const img of images) {
      const { data, mimeType } = img;
      if (!data || !mimeType) continue;

      const ext = mimeType.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
      const filename = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const filepath = path.join(uploadsDir, filename);

      // Strip data URL prefix if present
      const base64Data = data.includes(',') ? data.split(',')[1] : data;
      fs.writeFileSync(filepath, Buffer.from(base64Data, 'base64'));

      savedPaths.push(filepath);
    }

    console.log(`  📎  [upload] Saved ${savedPaths.length} image(s)`);
    // Return both absolute paths (for storage) and relative paths (for agy)
    const relativePaths = savedPaths.map((p: string) => path.relative(process.cwd(), p));
    res.json({ paths: savedPaths, relativePaths });
  } catch (err: any) {
    console.error('  ❌  [upload] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ==================== AGY Streaming ====================

// POST /api/agy/query — stream a query through agy
// This is the main endpoint that the frontend calls.
// It spawns an agy process, streams NDJSON, and forwards text_delta as SSE.
app.post('/api/agy/query', (req, res) => {
  const { projectId, query, model, imagePaths } = req.body;

  if (!projectId || !query) {
    return res.status(400).json({ error: 'projectId and query are required' });
  }

  const reqStart = Date.now();

  // Look up the project's existing agy conversation ID
  const project = dbApi.getProject(projectId) as any;
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const agyConversationId = project.agy_conversation_id;
  const agyModel = model || project.agy_model || 'gemini-3.8-flash-low';
  const isNewSession = !agyConversationId;

  console.log(`[agy] request | project=${projectId}, model=${agyModel}, session=${isNewSession ? 'new' : 'continue'}, conv=${agyConversationId || 'none'}`);
  console.log(`[agy] prompt | len=${query.length}, text="${query.slice(0, 120).replace(/\n/g, '\\n')}${query.length > 120 ? '…' : ''}"`);

  // Build the final prompt — prepend image paths if any
  let finalQuery = query;
  if (imagePaths && Array.isArray(imagePaths) && imagePaths.length > 0) {
    const relPaths = imagePaths.map((p: string) => {
      const abs = path.isAbsolute(p) ? p : path.join(process.cwd(), p);
      return path.relative(process.cwd(), abs);
    });
    const imageRefs = relPaths.map((p: string, i: number) => `Image ${i + 1}: ${p}`).join('\n');
    finalQuery = `The user has uploaded ${relPaths.length} image(s). View ONLY these specific files:\n${imageRefs}\n\n${query}`;
    console.log(`[agy] images | count=${relPaths.length}, paths=${relPaths.join(';')}`);
  }

  // Build agy command
  const args: string[] = [
    '--output-format', 'stream-json',
    '--dangerously-skip-permissions',
  ];

  if (agyConversationId) {
    args.push('--conversation', agyConversationId);
  } else {
    args.push('--model', agyModel);
  }

  args.push('-p', finalQuery);

  console.log(`[agy] spawn | cmd=agy, args=${args.length}, prompt_len=${finalQuery.length}`);

  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const agyBin = process.env.AGY_BIN
    || ['/snap/bin/agy', `${process.env.HOME}/.local/bin/agy`]
        .find((p) => { try { require('fs').accessSync(p); return true; } catch { return false; } })
    || 'agy';
  const agyProcess = spawn(agyBin, args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PATH: `/snap/bin:${process.env.HOME}/.local/bin:${process.env.HOME}/.gemini/antigravity-ide/bin:${process.env.PATH}`,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  console.log(`[agy] pid | pid=${agyProcess.pid}, bin=${agyBin}`);

  let agyDone = false;

  // Track stats
  agyStats.totalRequests++;
  agyStats.activeRequests++;
  agyStats.lastRequestAt = Date.now();
  if (!agyStats.sessionsByProject[projectId]) {
    agyStats.sessionsByProject[projectId] = {
      conversationId: agyConversationId || null,
      requestCount: 0,
      lastModel: agyModel,
      lastRequestAt: Date.now(),
    };
  }
  agyStats.sessionsByProject[projectId].requestCount++;
  agyStats.sessionsByProject[projectId].lastModel = agyModel;
  agyStats.sessionsByProject[projectId].lastRequestAt = Date.now();

  let buffer = '';
  let conversationIdCaptured = agyConversationId || '';
  let fullResponse = '';
  let chunkCount = 0;
  let stepCount = 0;

  agyProcess.stdout.on('data', (data: Buffer) => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const json = JSON.parse(line);

        // Capture conversation_id from init event
        if (json.event === 'init' && json.conversation_id) {
          conversationIdCaptured = json.conversation_id;
          console.log(`[agy] event:init | conv=${conversationIdCaptured}, new=${isNewSession}`);

          if (!agyConversationId) {
            dbApi.setAgyConversationId(projectId, conversationIdCaptured);
            if (agyModel) {
              dbApi.setAgyModel(projectId, agyModel);
            }
            console.log(`[agy] session:saved | project=${projectId}, conv=${conversationIdCaptured}, model=${agyModel}`);
          }

          res.write(`data: ${JSON.stringify({
            type: 'init',
            conversationId: conversationIdCaptured,
          })}\n\n`);
        }

        // Forward text deltas
        if (json.event === 'step_update' && json.step_update?.step_type === 'agent_response') {
          const delta = json.step_update.text_delta;
          if (delta) {
            fullResponse += delta;
            chunkCount++;
            res.write(`data: ${JSON.stringify({
              type: 'delta',
              text: delta,
            })}\n\n`);
          }
          // Log step transitions
          if (json.step_update.state === 'ACTIVE' && json.step_update.step_index !== undefined) {
            const newStep = json.step_update.step_index;
            if (newStep !== stepCount) {
              stepCount = newStep;
              console.log(`[agy] event:step | step=${newStep}, type=${json.step_update.step_type}, conv=${conversationIdCaptured}`);
            }
          }
        }

        // Tool use events
        if (json.event === 'step_update' && json.step_update?.step_type === 'tool_use') {
          console.log(`[agy] event:tool | step=${json.step_update.step_index}, tool=${json.step_update.tool_name || 'unknown'}, conv=${conversationIdCaptured}`);
        }

        // Result event — final
        if (json.event === 'result') {
          const usage = json.result?.usage;
          const tokensIn = usage?.input_tokens || usage?.prompt_tokens || 0;
          const tokensOut = usage?.output_tokens || usage?.completion_tokens || 0;
          console.log(`[agy] event:result | tokens_in=${tokensIn}, tokens_out=${tokensOut}, chunks=${chunkCount}, response_len=${fullResponse.length}`);

          if (usage) {
            agyStats.totalTokensIn += tokensIn;
            agyStats.totalTokensOut += tokensOut;
          }
          res.write(`data: ${JSON.stringify({
            type: 'done',
            conversationId: conversationIdCaptured,
            usage: usage || null,
          })}\n\n`);
        }
      } catch {
        // skip malformed JSON lines
      }
    }
  });

  agyProcess.stderr.on('data', (data: Buffer) => {
    const errText = data.toString().trim();
    if (errText) {
      console.log(`[agy] stderr | ${errText.slice(0, 200)}`);
    }
  });

  agyProcess.on('close', (code) => {
    agyDone = true;
    agyStats.activeRequests = Math.max(0, agyStats.activeRequests - 1);
    const elapsed = Date.now() - reqStart;

    // Update session conversation ID
    if (conversationIdCaptured && agyStats.sessionsByProject[projectId]) {
      agyStats.sessionsByProject[projectId].conversationId = conversationIdCaptured;
    }

    // One-line CSV summary with token window
    console.log(`[agy] close | code=${code}, elapsed=${elapsed}ms, chunks=${chunkCount}, steps=${stepCount}, response_len=${fullResponse.length}, conv=${conversationIdCaptured}, project=${projectId}, model=${agyModel}, window_tokens_in=${agyStats.totalTokensIn}, window_tokens_out=${agyStats.totalTokensOut}, window_total=${agyStats.totalTokensIn + agyStats.totalTokensOut}, window_requests=${agyStats.totalRequests}`);

    // Detect stale conversation
    const wasStale = agyConversationId && !fullResponse && code === 0;
    if (wasStale) {
      agyStats.totalRetries++;
      console.log(`[agy] stale | conv=${agyConversationId}, action=retry_fresh, project=${projectId}`);
      dbApi.setAgyConversationId(projectId, '');

      // Retry as a fresh conversation
      const retryArgs: string[] = [
        '--output-format', 'stream-json',
        '--dangerously-skip-permissions',
        '--model', agyModel,
        '-p', query,
      ];
      console.log(`[agy] retry:spawn | model=${agyModel}, prompt_len=${query.length}, project=${projectId}`);

      const retryProcess = spawn(agyBin, retryArgs, {
        cwd: process.cwd(),
        env: {
          ...process.env,
          PATH: `/snap/bin:${process.env.HOME}/.local/bin:${process.env.HOME}/.gemini/antigravity-ide/bin:${process.env.PATH}`,
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let retryBuffer = '';
      retryProcess.stdout.on('data', (data: Buffer) => {
        retryBuffer += data.toString();
        const lines = retryBuffer.split('\n');
        retryBuffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const json = JSON.parse(line);
            if (json.event === 'init' && json.conversation_id) {
              dbApi.setAgyConversationId(projectId, json.conversation_id);
              if (agyModel) dbApi.setAgyModel(projectId, agyModel);
              console.log(`[agy] retry:init | conv=${json.conversation_id}, project=${projectId}`);
              res.write(`data: ${JSON.stringify({ type: 'init', conversationId: json.conversation_id })}\n\n`);
            }
            if (json.event === 'step_update' && json.step_update?.step_type === 'agent_response') {
              const delta = json.step_update.text_delta;
              if (delta) {
                res.write(`data: ${JSON.stringify({ type: 'delta', text: delta })}\n\n`);
              }
            }
            if (json.event === 'result') {
              res.write(`data: ${JSON.stringify({ type: 'done', conversationId: json.conversation_id, usage: json.result?.usage })}\n\n`);
            }
          } catch { /* skip */ }
        }
      });

      retryProcess.stderr.on('data', (data: Buffer) => {
        const errText = data.toString().trim();
        if (errText) console.log(`[agy] retry:stderr | ${errText.slice(0, 200)}`);
      });

      retryProcess.on('close', (retryCode) => {
        if (retryCode !== 0 && retryCode !== null) {
          res.write(`data: ${JSON.stringify({ type: 'error', error: `agy retry exited with code ${retryCode}` })}\n\n`);
        }
        res.write('data: [DONE]\n\n');
        res.end();
        console.log(`[agy] retry:close | code=${retryCode}, project=${projectId}`);
      });

      retryProcess.on('error', (err) => {
        console.log(`[agy] retry:error | error=${err.message}, project=${projectId}`);
        res.write(`data: ${JSON.stringify({ type: 'error', error: `Retry spawn failed: ${err.message}` })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      });

      return; // Don't end the response — retry handles it
    }

    if (code !== 0 && code !== null) {
      agyStats.errors++;
      res.write(`data: ${JSON.stringify({
        type: 'error',
        error: `agy process exited with code ${code}`,
      })}\n\n`);
    }
    res.write('data: [DONE]\n\n');
    res.end();
  });

  agyProcess.on('error', (err) => {
    agyDone = true;
    agyStats.activeRequests = Math.max(0, agyStats.activeRequests - 1);
    agyStats.errors++;
    console.log(`[agy] error:spawn | error=${err.message}, project=${projectId}`);
    res.write(`data: ${JSON.stringify({
      type: 'error',
      error: `Failed to spawn agy: ${err.message}`,
    })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  });

  // Handle client disconnect — only kill if agy is still running
  res.on('close', () => {
    if (!agyDone && !agyProcess.killed) {
      agyProcess.kill('SIGTERM');
      console.log('  🔌  [agy] Client disconnected, killed agy process');
    }
  });
});

// Get agy session info for a project
app.get('/api/agy/session/:projectId', (req, res) => {
  try {
    const project = dbApi.getProject(req.params.projectId) as any;
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json({
      conversationId: project.agy_conversation_id,
      model: project.agy_model,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Reset agy session for a project (start fresh)
app.post('/api/agy/session/:projectId/reset', (req, res) => {
  try {
    dbApi.setAgyConversationId(req.params.projectId, '');
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update agy model for a project
app.patch('/api/agy/session/:projectId/model', (req, res) => {
  try {
    const { model } = req.body;
    dbApi.setAgyModel(req.params.projectId, model);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== Bookmarks ====================

app.patch('/api/nodes/:id/bookmark', (req, res) => {
  try {
    const bookmarked = dbApi.toggleBookmark(req.params.id);
    res.json({ bookmarked });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== Node Search ====================

app.get('/api/projects/:pid/search', (req, res) => {
  try {
    const query = (req.query.q as string) || '';
    if (!query.trim()) {
      return res.json([]);
    }
    const results = dbApi.searchNodes(req.params.pid, query);
    res.json(results);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== Import / Export ====================

app.get('/api/projects/:id/export', (req, res) => {
  try {
    const data = dbApi.exportProject(req.params.id);
    if (!data) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${data.project.name.replace(/[^a-zA-Z0-9]/g, '_')}.json"`);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/projects/import', express.json({ limit: '50mb' }), (req, res) => {
  try {
    const data = req.body;
    if (!data?.project?.name || !data?.nodes) {
      return res.status(400).json({ error: 'Invalid project data' });
    }
    const id = `import_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const result = dbApi.importProject(id, data);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== Health ====================

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

app.get('/api/agy/stats', (_req, res) => {
  const now = Date.now();
  res.json({
    uptime: formatUptime(now - serverStartTime),
    uptimeMs: now - serverStartTime,
    ...agyStats,
  });
});

app.listen(PORT, () => {
  console.log(`\n  🗄️  DFS Chat API server running on http://localhost:${PORT}`);
  console.log(`  📁  Database: dfs-chat.db`);
  console.log(`  🤖  Antigravity (agy) integration enabled`);
  console.log(`  📊  Stats logging every 5 minutes\n`);
  // Log initial stats on startup
  setTimeout(logAgyStats, 1000);
});

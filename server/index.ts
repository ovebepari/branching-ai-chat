import express from 'express';
import cors from 'cors';
import { spawn } from 'child_process';
import { dbApi } from './db.js';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

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
    const { id, label, prompt, parentId } = req.body;
    const node = dbApi.createNode(id, req.params.projectId, label, prompt, parentId);

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

// ==================== AGY Streaming ====================

// POST /api/agy/query — stream a query through agy
// This is the main endpoint that the frontend calls.
// It spawns an agy process, streams NDJSON, and forwards text_delta as SSE.
app.post('/api/agy/query', (req, res) => {
  const { projectId, query, model } = req.body;

  if (!projectId || !query) {
    return res.status(400).json({ error: 'projectId and query are required' });
  }

  // Look up the project's existing agy conversation ID
  const project = dbApi.getProject(projectId) as any;
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const agyConversationId = project.agy_conversation_id;
  const agyModel = model || project.agy_model || 'gemini-3.8-flash-low';

  // Build agy command
  const args: string[] = [
    '--output-format', 'stream-json',
    '--dangerously-skip-permissions',
  ];

  if (agyConversationId) {
    // Continue existing conversation
    args.push('--conversation', agyConversationId);
  } else {
    // New conversation — set model
    args.push('--model', agyModel);
  }

  args.push('-p', query);

  console.log(`[agy] Spawning: agy ${args.join(' ').slice(0, 100)}...`);

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

  let agyDone = false;

  let buffer = '';
  let conversationIdCaptured = agyConversationId || '';
  let fullResponse = '';

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

          // Persist the conversation ID to the project if it's new
          if (!agyConversationId) {
            dbApi.setAgyConversationId(projectId, conversationIdCaptured);
            if (agyModel) {
              dbApi.setAgyModel(projectId, agyModel);
            }
          }

          // Send init event to client
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
            res.write(`data: ${JSON.stringify({
              type: 'delta',
              text: delta,
            })}\n\n`);
          }
        }

        // Result event — final
        if (json.event === 'result') {
          res.write(`data: ${JSON.stringify({
            type: 'done',
            conversationId: conversationIdCaptured,
            usage: json.result?.usage,
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
      console.error(`[agy stderr] ${errText}`);
    }
  });

  agyProcess.on('close', (code) => {
    agyDone = true;
    if (code !== 0 && code !== null) {
      res.write(`data: ${JSON.stringify({
        type: 'error',
        error: `agy process exited with code ${code}`,
      })}\n\n`);
    }
    res.write('data: [DONE]\n\n');
    res.end();
    console.log(`[agy] Process exited with code ${code}`);
  });

  agyProcess.on('error', (err) => {
    agyDone = true;
    console.error(`[agy] Spawn error: ${err.message}`);
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
      console.log('[agy] Client disconnected, killed agy process');
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

app.listen(PORT, () => {
  console.log(`\n  🗄️  DFS Chat API server running on http://localhost:${PORT}`);
  console.log(`  📁  Database: dfs-chat.db`);
  console.log(`  🤖  Antigravity (agy) integration enabled\n`);
});

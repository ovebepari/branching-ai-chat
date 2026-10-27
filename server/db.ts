import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'dfs-chat.db');

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// --- Schema ---
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    root_node_id TEXT,
    active_node_id TEXT,
    agy_conversation_id TEXT,
    agy_model TEXT DEFAULT 'gemini-3.8-flash-low',
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
  );

  CREATE TABLE IF NOT EXISTS nodes (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    label TEXT NOT NULL DEFAULT '',
    prompt TEXT NOT NULL DEFAULT '',
    response TEXT NOT NULL DEFAULT '',
    parent_id TEXT,
    status TEXT NOT NULL DEFAULT 'idle',
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_nodes_project ON nodes(project_id);
  CREATE INDEX IF NOT EXISTS idx_nodes_parent ON nodes(parent_id);
`);

// Migration: add agy columns if they don't exist
try {
  db.exec(`ALTER TABLE projects ADD COLUMN agy_conversation_id TEXT`);
} catch { /* column already exists */ }
try {
  db.exec(`ALTER TABLE projects ADD COLUMN agy_model TEXT DEFAULT 'gemini-3.8-flash-low'`);
} catch { /* column already exists */ }
try {
  db.exec(`ALTER TABLE nodes ADD COLUMN bookmarked INTEGER NOT NULL DEFAULT 0`);
} catch { /* column already exists */ }

// --- Prepared statements ---

// Projects
const insertProject = db.prepare(
  `INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`
);

const getAllProjects = db.prepare(
  `SELECT * FROM projects ORDER BY updated_at DESC`
);

const getProject = db.prepare(
  `SELECT * FROM projects WHERE id = ?`
);

const updateProjectName = db.prepare(
  `UPDATE projects SET name = ?, updated_at = ? WHERE id = ?`
);

const updateProjectActiveNode = db.prepare(
  `UPDATE projects SET active_node_id = ?, updated_at = ? WHERE id = ?`
);

const updateProjectRootNode = db.prepare(
  `UPDATE projects SET root_node_id = ?, updated_at = ? WHERE id = ?`
);

const updateProjectAgyConversation = db.prepare(
  `UPDATE projects SET agy_conversation_id = ?, updated_at = ? WHERE id = ?`
);

const updateProjectAgyModel = db.prepare(
  `UPDATE projects SET agy_model = ?, updated_at = ? WHERE id = ?`
);

const deleteProjectStmt = db.prepare(
  `DELETE FROM projects WHERE id = ?`
);

// Nodes
const insertNode = db.prepare(
  `INSERT INTO nodes (id, project_id, label, prompt, response, parent_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
);

const getNodesByProject = db.prepare(
  `SELECT * FROM nodes WHERE project_id = ? ORDER BY created_at ASC`
);

const getNode = db.prepare(
  `SELECT * FROM nodes WHERE id = ?`
);

const updateNodeResponse = db.prepare(
  `UPDATE nodes SET response = ?, status = ? WHERE id = ?`
);

const updateNodeLabel = db.prepare(
  `UPDATE nodes SET label = ? WHERE id = ?`
);

const updateNodeStatus = db.prepare(
  `UPDATE nodes SET status = ? WHERE id = ?`
);

const deleteNodeStmt = db.prepare(
  `DELETE FROM nodes WHERE id = ?`
);

const deleteNodesByProject = db.prepare(
  `DELETE FROM nodes WHERE project_id = ?`
);

const toggleNodeBookmark = db.prepare(
  `UPDATE nodes SET bookmarked = NOT bookmarked WHERE id = ?`
);

const searchNodes = db.prepare(
  `SELECT * FROM nodes WHERE project_id = ? AND (prompt LIKE ? OR response LIKE ? OR label LIKE ?) ORDER BY created_at ASC`
);

// --- Export API ---

export const dbApi = {
  // Projects
  createProject(id: string, name: string) {
    const now = Date.now();
    insertProject.run(id, name, now, now);
    return getProject.get(id);
  },

  listProjects() {
    return getAllProjects.all();
  },

  getProject(id: string) {
    return getProject.get(id);
  },

  renameProject(id: string, name: string) {
    updateProjectName.run(name, Date.now(), id);
    return getProject.get(id);
  },

  setActiveNode(projectId: string, nodeId: string | null) {
    updateProjectActiveNode.run(nodeId, Date.now(), projectId);
  },

  setRootNode(projectId: string, nodeId: string) {
    updateProjectRootNode.run(nodeId, Date.now(), projectId);
  },

  setAgyConversationId(projectId: string, conversationId: string) {
    updateProjectAgyConversation.run(conversationId, Date.now(), projectId);
  },

  setAgyModel(projectId: string, model: string) {
    updateProjectAgyModel.run(model, Date.now(), projectId);
  },

  deleteProject(id: string) {
    deleteNodesByProject.run(id);
    deleteProjectStmt.run(id);
  },

  // Nodes
  createNode(
    id: string,
    projectId: string,
    label: string,
    prompt: string,
    parentId: string | null
  ) {
    const now = Date.now();
    insertNode.run(id, projectId, label, prompt, '', parentId, 'idle', now);
    return getNode.get(id);
  },

  getProjectNodes(projectId: string) {
    return getNodesByProject.all(projectId);
  },

  getNode(id: string) {
    return getNode.get(id);
  },

  updateResponse(id: string, response: string, status: string = 'complete') {
    updateNodeResponse.run(response, status, id);
  },

  updateLabel(id: string, label: string) {
    updateNodeLabel.run(label, id);
  },

  updateStatus(id: string, status: string) {
    updateNodeStatus.run(status, id);
  },

  deleteNode(id: string) {
    deleteNodeStmt.run(id);
  },

  // Delete a node and all its descendants recursively
  deleteNodeTree(id: string, projectId: string) {
    const allNodes = getNodesByProject.all(projectId) as any[];
    const toDelete = new Set<string>();

    const collect = (nodeId: string) => {
      toDelete.add(nodeId);
      for (const n of allNodes) {
        if (n.parent_id === nodeId) collect(n.id);
      }
    };
    collect(id);

    const deleteMany = db.transaction(() => {
      for (const nid of toDelete) {
        deleteNodeStmt.run(nid);
      }
    });
    deleteMany();

    return toDelete;
  },

  // Get full project with nodes as a tree-compatible structure
  getFullProject(projectId: string) {
    const project = getProject.get(projectId) as any;
    if (!project) return null;

    const rows = getNodesByProject.all(projectId) as any[];
    const nodes: Record<string, any> = {};

    // First pass: create node objects
    for (const row of rows) {
      nodes[row.id] = {
        id: row.id,
        label: row.label,
        prompt: row.prompt,
        response: row.response,
        parentId: row.parent_id,
        children: [],
        status: row.status,
        createdAt: row.created_at,
        bookmarked: !!row.bookmarked,
      };
    }

    // Second pass: build children arrays
    for (const row of rows) {
      if (row.parent_id && nodes[row.parent_id]) {
        nodes[row.parent_id].children.push(row.id);
      }
    }

    return {
      id: project.id,
      name: project.name,
      rootNodeId: project.root_node_id,
      activeNodeId: project.active_node_id,
      agyConversationId: project.agy_conversation_id,
      agyModel: project.agy_model,
      nodes,
      createdAt: project.created_at,
    };
  },

  toggleBookmark(id: string) {
    toggleNodeBookmark.run(id);
    const node = getNode.get(id) as any;
    return !!node?.bookmarked;
  },

  searchNodes(projectId: string, query: string) {
    const like = `%${query}%`;
    return searchNodes.all(projectId, like, like, like) as any[];
  },

  // Export full project as JSON
  exportProject(projectId: string) {
    const project = getProject.get(projectId) as any;
    if (!project) return null;

    const nodes = getNodesByProject.all(projectId) as any[];

    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      project: {
        name: project.name,
        rootNodeId: project.root_node_id,
        agyModel: project.agy_model,
      },
      nodes: nodes.map((n: any) => ({
        id: n.id,
        label: n.label,
        prompt: n.prompt,
        response: n.response,
        parentId: n.parent_id,
        status: n.status,
        bookmarked: !!n.bookmarked,
        createdAt: n.created_at,
      })),
    };
  },

  // Import project from JSON
  importProject(id: string, data: any) {
    const now = Date.now();
    insertProject.run(id, data.project.name, now, now);

    if (data.project.agyModel) {
      updateProjectAgyModel.run(data.project.agyModel, now, id);
    }

    const importNodes = db.transaction(() => {
      for (const n of data.nodes) {
        insertNode.run(n.id, id, n.label, n.prompt, n.response || '', n.parentId, n.status || 'complete', n.createdAt || now);
        if (n.bookmarked) {
          toggleNodeBookmark.run(n.id);
        }
      }
    });
    importNodes();

    if (data.project.rootNodeId) {
      updateProjectRootNode.run(data.project.rootNodeId, now, id);
    }

    return dbApi.getFullProject(id);
  },
};

export default db;

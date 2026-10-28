import { useCallback, useEffect, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeTypes,
  BackgroundVariant,
  type NodeMouseHandler,
  useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useTreeStore } from '../store/useTreeStore';
import { CustomTreeNode } from './TreeNode';
import { GitFork, MessageSquare } from 'lucide-react';

// Layout config
const NODE_WIDTH = 290;
const NODE_HEIGHT = 110;
const HORIZONTAL_GAP = 49;
const VERTICAL_GAP = 81;

const nodeTypes: NodeTypes = {
  treeNode: CustomTreeNode,
};

// Compute tree layout using a simple recursive algorithm
function computeLayout(
  nodeId: string,
  nodesMap: Record<string, any>,
  depth: number,
  xOffset: { value: number }
): { nodes: Node[]; edges: Edge[] } {
  const treeNode = nodesMap[nodeId];
  if (!treeNode) return { nodes: [], edges: [] };

  const x = xOffset.value;
  const y = depth * (NODE_HEIGHT + VERTICAL_GAP);

  const flowNode: Node = {
    id: nodeId,
    type: 'treeNode',
    position: { x, y },
    data: { ...treeNode },
    style: { width: NODE_WIDTH },
  };

  const result: { nodes: Node[]; edges: Edge[] } = {
    nodes: [flowNode],
    edges: [],
  };

  const children = treeNode.children || [];
  if (children.length === 0) {
    xOffset.value += NODE_WIDTH + HORIZONTAL_GAP;
    return result;
  }

  for (const childId of children) {
    const childResult = computeLayout(childId, nodesMap, depth + 1, xOffset);
    result.nodes.push(...childResult.nodes);
    result.edges.push(...childResult.edges);

    const isStreaming = nodesMap[childId]?.status === 'streaming';
    const isComplete = nodesMap[childId]?.status === 'complete';
    const isError = nodesMap[childId]?.status === 'error';

    result.edges.push({
      id: `${nodeId}->${childId}`,
      source: nodeId,
      target: childId,
      type: 'smoothstep',
      animated: isStreaming,
      style: {
        stroke: isError ? 'var(--accent-danger)' :
                isStreaming ? 'var(--accent-primary)' :
                isComplete ? 'var(--accent-success)' :
                undefined,
        strokeWidth: isStreaming ? 2.5 : 1.5,
        opacity: isComplete ? 0.7 : 1,
      },
      markerEnd: {
        type: 'arrowclosed' as any,
        width: 16,
        height: 16,
        color: isError ? 'var(--accent-danger)' :
               isStreaming ? 'var(--accent-primary)' :
               'var(--border-medium)',
      },
    });
  }

  // Center parent over children
  const childXPositions = children
    .map((cid: string) => result.nodes.find((n) => n.id === cid)?.position.x ?? 0);
  const minX = Math.min(...childXPositions);
  const maxX = Math.max(...childXPositions);
  flowNode.position.x = (minX + maxX) / 2;

  return result;
}

function TreeCanvasInner() {
  const project = useTreeStore((s) => s.projects.find((p) => p.id === s.activeProjectId));
  const setActiveNode = useTreeStore((s) => s.setActiveNode);
  const { fitView } = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Compute layout from tree state
  const layoutData = useMemo(() => {
    if (!project?.rootNodeId || !project.nodes[project.rootNodeId]) {
      return { nodes: [], edges: [] };
    }
    return computeLayout(
      project.rootNodeId,
      project.nodes,
      0,
      { value: 0 }
    );
  }, [project?.rootNodeId, project?.nodes]);

  // Sync layout to React Flow state, preserving selection
  useEffect(() => {
    const activeId = project?.activeNodeId;
    const updatedNodes = layoutData.nodes.map((n) => ({
      ...n,
      selected: n.id === activeId,
      data: {
        ...n.data,
        isActive: n.id === activeId,
      },
    }));
    setNodes(updatedNodes);
    setEdges(layoutData.edges);
  }, [layoutData, project?.activeNodeId, setNodes, setEdges]);

  const darkMode = useTreeStore((s) => s.darkMode);

  // Fit view when nodes change significantly
  useEffect(() => {
    if (nodes.length > 0) {
      setTimeout(() => fitView({ padding: 0.5, duration: 500, maxZoom: 1.0 }), 50);
    }
  }, [nodes.length, fitView]);

  const onNodeClick: NodeMouseHandler = useCallback(
    (_, node) => {
      setActiveNode(node.id);
    },
    [setActiveNode]
  );

  const isEmpty = !project?.rootNodeId;

  return (
    <div className="tree-canvas-container">
      {isEmpty && (
        <div className="canvas-empty">
          <div className="canvas-empty-icon">
            <GitFork size={28} />
          </div>
          <h2>Start a conversation</h2>
          <p>
            Type your first message in the chat pane to create the root node
            of your conversation tree.
          </p>
        </div>
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.5, duration: 500, maxZoom: 1.0 }}
        defaultViewport={{ x: 0, y: 0, zoom: 1.0 }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.05}
        maxZoom={2}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={true}
        snapToGrid
        snapGrid={[20, 20]}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={3}
          color={darkMode ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)'}
        />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor={(n) => {
            if (n.data?.isActive) return '#3A37FF';
            if (n.data?.status === 'streaming') return '#3A37FF';
            if (n.data?.status === 'error') return '#ef4444';
            return darkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)';
          }}
          maskColor={darkMode ? 'rgba(20,20,28,0.8)' : 'rgba(250,249,247,0.8)'}
          style={{ borderRadius: 8, border: '1px solid var(--border-light)' }}
          pannable
          zoomable
        />
      </ReactFlow>
    </div>
  );
}

export function TreeCanvas() {
  return (
    <ReactFlowProvider>
      <TreeCanvasInner />
    </ReactFlowProvider>
  );
}

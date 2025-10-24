import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import "./DashboardShell.css";

const SIDEBAR_MIN_WIDTH = 240;
const SIDEBAR_MAX_WIDTH = 480;

export type FilterNode = {
  id: string;
  label: string;
  badge?: string;
  description?: string;
  highlights?: string[];
  stats?: Array<{ label: string; value: string }>;
  actions?: string[];
  children?: FilterNode[];
  insight?: FilterNodeInsight;
};

export type FilterNodeInsight =
  | {
      kind: "first-time";
    }
  | {
      kind: "dormant";
      inactiveDays?: number;
    }
  | {
      kind: "address-group";
      addresses: string[];
    };

type DashboardShellProps = {
  filters: FilterNode[];
  sidebarTitle?: string;
  sidebarDescription?: string;
  children?: (selected: FilterNode | null) => ReactNode;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const buildNodeMap = (nodes: FilterNode[], map = new Map<string, FilterNode>()) => {
  for (const node of nodes) {
    map.set(node.id, node);
    if (node.children?.length) {
      buildNodeMap(node.children, map);
    }
  }
  return map;
};

const findFirstLeafId = (nodes: FilterNode[]): string | null => {
  for (const node of nodes) {
    if (node.children?.length) {
      const childLeaf = findFirstLeafId(node.children);
      if (childLeaf) {
        return childLeaf;
      }
    } else {
      return node.id;
    }
  }
  return null;
};

const createInitialExpansion = (
  nodes: FilterNode[],
  depth = 0,
  expanded: Record<string, boolean> = {},
) => {
  for (const node of nodes) {
    if (node.children?.length) {
      if (depth <= 1) {
        expanded[node.id] = true;
      }
      createInitialExpansion(node.children, depth + 1, expanded);
    }
  }
  return expanded;
};

export default function DashboardShell({
  filters,
  sidebarTitle = "MailLens",
  sidebarDescription = "Browse saved filters, curated dashboards, and personal shortcuts.",
  children,
}: DashboardShellProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    createInitialExpansion(filters),
  );
  const [selectedId, setSelectedId] = useState<string | null>(() => findFirstLeafId(filters));
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    clamp(320, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH),
  );
  const [isResizing, setIsResizing] = useState(false);

  const appShellRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLElement | null>(null);
  const containerOffsetRef = useRef(0);

  const nodeMap = useMemo(() => buildNodeMap(filters), [filters]);
  const selectedNode = selectedId ? nodeMap.get(selectedId) ?? null : null;

  useEffect(() => {
    setExpanded(createInitialExpansion(filters));
    setSelectedId(prev => {
      if (prev && nodeMap.has(prev)) {
        return prev;
      }
      return findFirstLeafId(filters);
    });
  }, [filters, nodeMap]);

  useEffect(() => {
    if (!isResizing) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const proposed = event.clientX - containerOffsetRef.current;
      setSidebarWidth(clamp(proposed, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  const toggleNode = (nodeId: string) => {
    setExpanded(prev => ({
      ...prev,
      [nodeId]: !prev[nodeId],
    }));
  };

  const beginResize = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!appShellRef.current) {
      return;
    }
    event.preventDefault();
    const { left } = appShellRef.current.getBoundingClientRect();
    containerOffsetRef.current = left;
    setIsResizing(true);
  };

  const renderTree = (node: FilterNode, depth: number): ReactNode => {
    const isExpandable = Boolean(node.children?.length);
    const isExpanded = Boolean(expanded[node.id]);
    const isSelected = selectedId === node.id;

    const rowClasses = ["dashboard-tree-row"];
    if (isSelected) {
      rowClasses.push("is-selected");
    }
    if (depth > 0) {
      rowClasses.push("has-parent");
    }

    const rowStyle = {
      "--depth-padding": `${depth * 20 + 18}px`,
      "--connector-offset": `${depth * 20 + 8}px`,
    } as CSSProperties;

    const childStyle = {
      "--tree-branch-left": `${(depth + 1) * 20 + 8}px`,
    } as CSSProperties;

    return (
      <div key={node.id} className="dashboard-tree-node">
        <div className={rowClasses.join(" ")} style={rowStyle}>
          {isExpandable ? (
            <button
              type="button"
              className="dashboard-tree-toggle"
              onClick={() => toggleNode(node.id)}
              aria-label={`${isExpanded ? "Collapse" : "Expand"} ${node.label}`}
              aria-expanded={isExpanded}
            >
              <span
                className={`dashboard-tree-caret${isExpanded ? " is-expanded" : ""}`}
                aria-hidden="true"
              />
            </button>
          ) : (
            <span className="dashboard-tree-spacer" aria-hidden="true" />
          )}
          <button
            type="button"
            className="dashboard-tree-label"
            onClick={() => setSelectedId(node.id)}
            aria-current={isSelected}
          >
            <span className="dashboard-tree-text">{node.label}</span>
            {node.badge ? <span className="dashboard-tree-badge">{node.badge}</span> : null}
          </button>
        </div>
        {isExpandable && isExpanded ? (
          <div className="dashboard-tree-children" style={childStyle}>
            {node.children!.map(child => renderTree(child, depth + 1))}
          </div>
        ) : null}
      </div>
    );
  };

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [selectedId]);

  return (
    <div className="dashboard-shell" ref={appShellRef}>
      <aside
        className={`dashboard-sidebar${isResizing ? " is-resizing" : ""}`}
        style={{ width: `${sidebarWidth}px` }}
      >
        <div className="dashboard-sidebar-header">
          <h1>{sidebarTitle}</h1>
          <p>{sidebarDescription}</p>
        </div>
        <nav className="dashboard-tree" aria-label="Saved views">
          {filters.map(node => renderTree(node, 0))}
        </nav>
      </aside>
      <div
        className={`dashboard-resize-handle${isResizing ? " is-active" : ""}`}
        role="separator"
        aria-orientation="vertical"
        aria-valuemin={SIDEBAR_MIN_WIDTH}
        aria-valuemax={SIDEBAR_MAX_WIDTH}
        aria-valuenow={Math.round(sidebarWidth)}
        onMouseDown={beginResize}
      >
        <span className="dashboard-resize-grip" aria-hidden="true" />
      </div>
      <section className="dashboard-content" aria-live="polite" ref={contentRef}>
        {selectedNode ? (
          <>
            <div className="dashboard-content-header">
              <h2>{selectedNode.label}</h2>
              {selectedNode.badge ? (
                <span className="dashboard-content-badge">{selectedNode.badge}</span>
              ) : null}
            </div>
            {selectedNode.description ? (
              <p className="dashboard-content-description">{selectedNode.description}</p>
            ) : (
              <p className="dashboard-content-description muted">
                Choose a nested view to see its summary and metrics.
              </p>
            )}
            {selectedNode.stats?.length ? (
              <div className="dashboard-content-stats">
                {selectedNode.stats.map(stat => (
                  <article className="dashboard-content-stat-card" key={stat.label}>
                    <span className="dashboard-content-stat-label">{stat.label}</span>
                    <span className="dashboard-content-stat-value">{stat.value}</span>
                  </article>
                ))}
              </div>
            ) : null}
            {selectedNode.highlights?.length ? (
              <div className="dashboard-content-section">
                <h3>Highlights</h3>
                <ul>
                  {selectedNode.highlights.map(highlight => (
                    <li key={highlight}>{highlight}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {selectedNode.actions?.length ? (
              <div className="dashboard-content-section">
                <h3>Suggested actions</h3>
                <ul>
                  {selectedNode.actions.map(action => (
                    <li key={action}>{action}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {typeof children === "function" ? children(selectedNode) : children}
          </>
        ) : (
          <div className="dashboard-content-empty">
            <h2>Select a view</h2>
            <p>Pick a filter, team board, or personal shortcut to load details.</p>
          </div>
        )}
      </section>
    </div>
  );
}

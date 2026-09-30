import { useMemo, useState } from 'react';
import { Background, Controls, MiniMap, ReactFlow, ReactFlowProvider, type Edge } from '@xyflow/react';
import { Info, X } from 'lucide-react';
import { useApp } from '../../state/AppState';
import { PageHeader, StatusBadge, EmptyState } from '../common/ui';
import { ReasonPath } from '../Measures/UsageTree';
import {
  buildFocusGraph, buildFullGraph, reasonPathIds, relatedNodes, type Direction, type GraphData,
} from './buildGraph';
import { layoutGraph } from './layout';
import { nodeTypes, type FlowData } from './GraphNodes';

const FULL_WARN = 300;

function GraphInner() {
  const { analysis, graphFocus, openInGraph, selectMeasure, theme } = useApp();
  const defaultFocus = useMemo(
    () => [...analysis.measures.values()].filter((m) => m.isUsed).sort((a, b) => b.depth - a.depth || a.name.localeCompare(b.name))[0]?.id ?? analysis.measureOrder[0] ?? null,
    [analysis],
  );
  const focus = graphFocus && analysis.measures.has(graphFocus) ? graphFocus : defaultFocus;

  const [mode, setMode] = useState<'focus' | 'full'>('focus');
  const [direction, setDirection] = useState<Direction>('both');
  const [showVisuals, setShowVisuals] = useState(true);
  const [fullTable, setFullTable] = useState('');
  const [fullStatus, setFullStatus] = useState<'all' | 'used' | 'unused'>('all');
  const [fullConfirmed, setFullConfirmed] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [pickText, setPickText] = useState('');

  const graph: GraphData | null = useMemo(() => {
    if (mode === 'focus') return focus ? buildFocusGraph(analysis, focus, { direction, showVisuals }) : null;
    const candidate = analysis.summary.totalMeasures;
    if (candidate > FULL_WARN && !fullConfirmed && !fullTable && fullStatus === 'all') return null; // render on demand only
    return buildFullGraph(analysis, { table: fullTable || undefined, status: fullStatus, showVisuals });
  }, [analysis, mode, focus, direction, showVisuals, fullTable, fullStatus, fullConfirmed]);

  const selectedNode = picked && graph?.nodes.some((n) => n.id === picked) ? picked : mode === 'focus' && focus ? `m:${focus}` : null;
  const selectedMeasure = selectedNode?.startsWith('m:') ? selectedNode.slice(2) : null;

  const { nodes, edges } = useMemo(() => {
    if (!graph) return { nodes: [], edges: [] };
    const pos = layoutGraph(graph);
    const rel = selectedNode ? relatedNodes(graph, selectedNode) : null;
    const hiSet = rel ? new Set([selectedNode!, ...rel.up, ...rel.down]) : null;
    const path = selectedMeasure ? reasonPathIds(analysis, selectedMeasure) : { nodes: new Set<string>(), edges: new Set<string>() };
    const n: FlowData[] = graph.nodes.map((g) => ({
      id: g.id,
      type: g.kind,
      position: pos.get(g.id)!,
      data: { g, dim: !!hiSet && !hiSet.has(g.id), hi: !!hiSet?.has(g.id), selected: g.id === selectedNode, focus: mode === 'focus' && g.id === `m:${focus}` },
    }));
    const e: Edge[] = graph.edges.map((ge) => {
      const onPath = path.edges.has(ge.id);
      const lit = !hiSet || (hiSet.has(ge.source) && hiSet.has(ge.target));
      return {
        id: ge.id, source: ge.source, target: ge.target,
        animated: onPath,
        style: {
          stroke: onPath ? '#2563eb' : lit ? (hiSet ? '#3b82f6' : '#94a3b8') : '#94a3b8',
          strokeWidth: onPath ? 3 : hiSet && lit ? 2 : 1.4,
          opacity: lit ? 1 : 0.15,
        },
        markerEnd: { type: 'arrowclosed' as const, color: onPath ? '#2563eb' : '#94a3b8' },
      };
    });
    return { nodes: n, edges: e };
  }, [graph, selectedNode, selectedMeasure, analysis, mode, focus]);

  const info = selectedMeasure ? analysis.measures.get(selectedMeasure) : null;
  const nameOf = (id: string) => analysis.measures.get(id)?.name ?? id;

  const btn = (active: boolean) => `btn ${active ? 'btn-primary' : ''}`;

  if (analysis.summary.totalMeasures === 0) return <div className="card"><EmptyState title="Nothing to show" hint="Load a model first." /></div>;

  return (
    <>
      <div className="card mb-3 flex flex-wrap items-end gap-3 p-3">
        <div className="flex gap-1.5">
          <button className={btn(mode === 'focus')} onClick={() => setMode('focus')}>Focus</button>
          <button className={btn(mode === 'full')} onClick={() => setMode('full')}>Full model</button>
        </div>

        {mode === 'focus' ? (
          <>
            <div>
              <label className="label" htmlFor="focus">Measure</label>
              <input
                id="focus" className="input w-64" list="measure-options" placeholder="Search measure…"
                value={pickText || (focus ? analysis.measures.get(focus)?.name ?? '' : '')}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => {
                  setPickText(e.target.value);
                  const hit = analysis.measureOrder.find((id) => id === e.target.value || analysis.measures.get(id)!.name === e.target.value);
                  if (hit) { openInGraph(hit); setPicked(null); setPickText(''); }
                }}
                onBlur={() => setPickText('')}
              />
              <datalist id="measure-options">{analysis.measureOrder.map((id) => <option key={id} value={analysis.measures.get(id)!.name}>{analysis.measures.get(id)!.table}</option>)}</datalist>
            </div>
            <div className="flex gap-1.5">
              <button className={btn(direction === 'both')} onClick={() => setDirection('both')}>Both</button>
              <button className={btn(direction === 'usedBy')} onClick={() => setDirection('usedBy')} title="Show what uses the measure, up to visuals">Used by</button>
              <button className={btn(direction === 'dependsOn')} onClick={() => setDirection('dependsOn')} title="Show what the measure depends on">Depends on</button>
            </div>
          </>
        ) : (
          <>
            <select className="input w-auto" value={fullTable} onChange={(e) => { setFullTable(e.target.value); setFullConfirmed(false); }} aria-label="Table filter">
              <option value="">All tables</option>
              {[...analysis.tables.keys()].sort().map((t) => <option key={t}>{t}</option>)}
            </select>
            <select className="input w-auto" value={fullStatus} onChange={(e) => setFullStatus(e.target.value as typeof fullStatus)} aria-label="Status filter">
              <option value="all">All measures</option><option value="used">Used only</option><option value="unused">Unused only</option>
            </select>
          </>
        )}
        <label className="flex items-center gap-1.5 pb-1.5 text-sm"><input type="checkbox" checked={showVisuals} onChange={(e) => setShowVisuals(e.target.checked)} /> Pages &amp; visuals</label>
        <div className="ml-auto flex flex-wrap items-center gap-3 pb-1.5 text-xs text-slate-500">
          <span><i className="mr-1 inline-block size-3 rounded border-2 border-blue-500 bg-blue-100 align-middle" />Direct</span>
          <span><i className="mr-1 inline-block size-3 rounded border-2 border-cyan-500 bg-cyan-100 align-middle" />Indirect</span>
          <span><i className="mr-1 inline-block size-3 rounded border-2 border-dashed border-red-500 bg-red-100 align-middle" />Unused</span>
          <span><i className="mr-1 inline-block size-3 rounded border-2 border-violet-400 bg-violet-100 align-middle" />Visual</span>
          <span><i className="mr-1 inline-block size-3 rounded border-2 border-fuchsia-500 bg-fuchsia-100 align-middle" />Field parameter</span>
        </div>
      </div>

      <div className="card relative h-[calc(100vh-15rem)] min-h-[420px] overflow-hidden">
        {!graph ? (
          <EmptyState title={`This model has ${analysis.summary.totalMeasures} measures`} hint="The full graph is rendered on demand. Filter by table or status first, or render everything.">
            <button className="btn btn-primary mt-2" onClick={() => setFullConfirmed(true)}>Render full graph</button>
          </EmptyState>
        ) : (
          <ReactFlow
            key={`${mode}-${focus}-${direction}-${showVisuals}-${fullTable}-${fullStatus}-${graph.nodes.length}`}
            nodes={nodes} edges={edges} nodeTypes={nodeTypes}
            fitView fitViewOptions={{ padding: 0.2, maxZoom: 1.1 }} minZoom={0.05} maxZoom={2}
            nodesConnectable={false} colorMode={theme}
            onNodeClick={(_, n) => setPicked(n.id)}
            onNodeDoubleClick={(_, n) => { const g = graph.nodes.find((x) => x.id === n.id); if (g?.measureId) { setMode('focus'); openInGraph(g.measureId); setPicked(null); } }}
            onPaneClick={() => setPicked(null)}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={20} />
            <Controls showInteractive={false} />
            {graph.nodes.length > 40 && <MiniMap pannable zoomable />}
          </ReactFlow>
        )}
        {graph?.truncated && <div className="absolute left-3 top-3 rounded-lg bg-amber-100 px-3 py-1 text-xs text-amber-900">Graph truncated for readability</div>}
        {graph && <div className="pointer-events-none absolute bottom-3 right-3 rounded bg-white/80 px-2 py-1 text-[11px] text-slate-500 dark:bg-slate-900/80">{graph.nodes.length} nodes · scroll to zoom · drag to pan · click = highlight · double-click = focus</div>}

        {info && (
          <div className="card absolute right-3 top-3 max-h-[85%] w-80 overflow-auto p-4 shadow-xl">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold">{info.name}</div>
                <div className="text-xs text-slate-500">{info.table}</div>
              </div>
              <button aria-label="Close" onClick={() => setPicked('')} className="text-slate-400 hover:text-slate-700"><X size={14} /></button>
            </div>
            <div className="mt-2 flex items-center gap-2"><StatusBadge status={info.status} /></div>
            <div className="mt-3 space-y-3 text-sm">
              <div>
                <div className="mb-1 text-xs font-semibold uppercase text-slate-500">Depends on ({info.dependsOn.length})</div>
                {info.dependsOn.length ? info.dependsOn.map((d) => <button key={d} className="mr-1 mb-1 badge bg-slate-100 dark:bg-slate-800" onClick={() => openInGraph(d)}>{nameOf(d)}</button>) : <span className="text-xs text-slate-500">—</span>}
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold uppercase text-slate-500">Used by ({info.usedByMeasures.length + info.directVisuals.length})</div>
                {info.usedByMeasures.map((d) => <button key={d} className="mr-1 mb-1 badge bg-slate-100 dark:bg-slate-800" onClick={() => openInGraph(d)}>{nameOf(d)}</button>)}
                {info.fieldParameters.map((f) => <span key={f} className="mr-1 mb-1 badge bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300">◇ {analysis.fieldParameters.get(f)?.name}</span>)}
                {info.directVisuals.map((v) => <span key={v} className="mr-1 mb-1 badge bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">▣ {analysis.visuals.get(v)?.name}</span>)}
                {!info.usedByMeasures.length && !info.directVisuals.length && !info.fieldParameters.length && <span className="text-xs text-slate-500">— (unused)</span>}
              </div>
              {info.reason && (
                <div>
                  <div className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase text-slate-500"><Info size={11} /> Path (highlighted in graph)</div>
                  <ReasonPath reason={info.reason} analysis={analysis} />
                </div>
              )}
            </div>
            <div className="mt-3 flex gap-2">
              <button className="btn" onClick={() => { setMode('focus'); openInGraph(info.id); setPicked(null); }}>Focus</button>
              <button className="btn" onClick={() => selectMeasure(info.id)}>Details</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export function DependencyGraphPage() {
  return (
    <>
      <PageHeader title="Dependencies" subtitle="Page → Visual → Measure → Measure … Click a node to highlight what it uses and what uses it." />
      <ReactFlowProvider>
        <GraphInner />
      </ReactFlowProvider>
    </>
  );
}

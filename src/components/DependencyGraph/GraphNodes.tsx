import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { AlertTriangle, BarChart3, FileText, ListChecks } from 'lucide-react';
import type { GNode } from './buildGraph';

export type FlowData = Node<{ g: GNode; dim: boolean; hi: boolean; selected: boolean; focus: boolean }>;

const handle = { background: '#94a3b8', width: 6, height: 6, border: 0 } as const;

function MeasureNode({ data }: NodeProps<FlowData>) {
  const { g, dim, selected, focus } = data;
  const tone =
    g.status === 'unused'
      ? 'border-2 border-dashed border-red-500 bg-red-50 text-red-900 dark:bg-red-950/50 dark:text-red-100'
      : g.status === 'direct'
        ? 'border-2 border-blue-500 bg-blue-50 text-blue-950 dark:bg-blue-950/60 dark:text-blue-50'
        : 'border-2 border-cyan-500 bg-cyan-50 text-cyan-950 dark:bg-cyan-950/50 dark:text-cyan-50';
  return (
    <div
      className={`w-[210px] rounded-xl px-3 py-2 shadow-sm transition ${tone} ${dim ? 'opacity-25' : ''} ${selected ? 'ring-4 ring-blue-400/50' : ''} ${focus ? 'shadow-lg shadow-blue-500/30' : ''}`}
      title={`${g.label} (${g.sub})`}
    >
      <Handle type="target" position={Position.Top} style={handle} />
      <div className="flex items-center gap-1.5">
        <span className="truncate text-sm font-semibold">{g.label}</span>
        {g.inCycle && <AlertTriangle size={13} className="shrink-0 text-amber-500" />}
      </div>
      <div className="flex items-center justify-between text-[11px] opacity-70">
        <span className="truncate">{g.sub}</span>
        {g.status === 'unused' && <span className="ml-1 rounded bg-red-500 px-1 font-bold text-white">UNUSED</span>}
        {g.status === 'indirect' && <span className="ml-1 font-semibold">indirect</span>}
        {g.status === 'direct' && <span className="ml-1 font-semibold">direct</span>}
      </div>
      <Handle type="source" position={Position.Bottom} style={handle} />
    </div>
  );
}

function VisualNode({ data }: NodeProps<FlowData>) {
  const { g, dim } = data;
  return (
    <div className={`w-[210px] rounded-xl border-2 border-violet-400 bg-violet-50 px-3 py-2 text-violet-950 dark:bg-violet-950/50 dark:text-violet-50 ${dim ? 'opacity-25' : ''}`}>
      <div className="flex items-center gap-1.5 text-sm font-semibold"><BarChart3 size={13} /><span className="truncate">{g.label}</span></div>
      <div className="text-[11px] opacity-70">Visual · {g.sub}</div>
      <Handle type="source" position={Position.Bottom} style={handle} />
      <Handle type="target" position={Position.Top} style={handle} />
    </div>
  );
}

function PageNode({ data }: NodeProps<FlowData>) {
  const { g, dim } = data;
  return (
    <div className={`w-[190px] rounded-lg border border-slate-400 bg-slate-100 px-3 py-1.5 text-slate-800 dark:bg-slate-800 dark:text-slate-100 ${dim ? 'opacity-25' : ''}`}>
      <div className="flex items-center gap-1.5 text-xs font-semibold"><FileText size={12} /><span className="truncate">{g.label}</span></div>
      <Handle type="source" position={Position.Bottom} style={handle} />
    </div>
  );
}

function ParamNode({ data }: NodeProps<FlowData>) {
  const { g, dim } = data;
  return (
    <div
      className={`w-[210px] rounded-xl border-2 ${g.used ? 'border-fuchsia-500' : 'border-dashed border-fuchsia-400'} bg-fuchsia-50 px-3 py-2 text-fuchsia-950 dark:bg-fuchsia-950/50 dark:text-fuchsia-50 ${dim ? 'opacity-25' : ''}`}
      title={g.used ? 'Field parameter used by a visual' : 'Field parameter not used by any visual – keeps nothing alive'}
    >
      <Handle type="target" position={Position.Top} style={handle} />
      <div className="flex items-center gap-1.5 text-sm font-semibold"><ListChecks size={13} /><span className="truncate">{g.label}</span></div>
      <div className="text-[11px] opacity-70">{g.used ? 'Field parameter' : 'Field parameter · unused'}</div>
      <Handle type="source" position={Position.Bottom} style={handle} />
    </div>
  );
}

function MoreNode({ data }: NodeProps<FlowData>) {
  return <div className="w-[190px] rounded-lg border border-dashed border-slate-400 px-3 py-1.5 text-center text-xs text-slate-500">{data.g.label}</div>;
}

export const nodeTypes = { measure: MeasureNode, visual: VisualNode, page: PageNode, param: ParamNode, more: MoreNode };

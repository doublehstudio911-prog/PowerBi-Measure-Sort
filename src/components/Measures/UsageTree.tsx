import { ArrowDown, BarChart3, ListChecks, RefreshCcw } from 'lucide-react';
import { useApp } from '../../state/AppState';
import type { TreeNode } from '../../engine';
import type { AnalysisResult, MeasureId, UsageReason } from '../../types/powerbi';

/** Indented tree of a dependency / used-by hierarchy. Cycles are cut and flagged. */
export function UsageTree({ node, root = true }: { node: TreeNode; root?: boolean }) {
  const { analysis, selectMeasure } = useApp();
  const m = analysis.measures.get(node.id);
  return (
    <div className={root ? '' : 'ml-4 border-l border-slate-200 pl-3 dark:border-slate-700'}>
      <button
        className={`my-0.5 flex items-center gap-1.5 rounded px-1 py-0.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800 ${root ? 'font-semibold' : ''}`}
        onClick={() => selectMeasure(node.id)}
      >
        <span className={`size-2 rounded-full ${m?.status === 'unused' ? 'bg-red-500' : m?.status === 'direct' ? 'bg-blue-500' : 'bg-cyan-500'}`} />
        {m?.name ?? node.id}
        <span className="text-xs text-slate-400">{m?.table}</span>
        {node.truncated === 'cycle' && <span className="badge bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"><RefreshCcw size={11} /> cycle</span>}
        {node.truncated === 'depth' && <span className="text-xs text-slate-400">…</span>}
      </button>
      {node.children.map((c, i) => <UsageTree key={c.id + i} node={c} root={false} />)}
    </div>
  );
}

/** "Why is this measure used?" – Page → Visual → Measure → … → target. */
export function ReasonPath({ reason, analysis }: { reason: UsageReason; analysis: AnalysisResult }) {
  const { selectMeasure } = useApp();
  const chain: MeasureId[] = reason.chain;
  const Box = ({ children, onClick, tone }: { children: React.ReactNode; onClick?: () => void; tone: string }) => (
    <button disabled={!onClick} onClick={onClick} className={`w-full rounded-lg border px-3 py-1.5 text-left text-sm ${tone}`}>{children}</button>
  );
  const Arrow = () => <div className="flex justify-center py-0.5 text-slate-400"><ArrowDown size={14} /></div>;
  const v = reason.root.kind === 'visual' ? analysis.visuals.get(reason.root.visualId) : null;
  return (
    <div>
      {v ? (
        <>
          <Box tone="border-slate-200 dark:border-slate-700"><span className="text-xs text-slate-500">Page</span><div>{v.page}</div></Box>
          <Arrow />
          <Box tone="border-violet-300 bg-violet-50 dark:border-violet-500/40 dark:bg-violet-500/10">
            <span className="flex items-center gap-1 text-xs text-violet-600 dark:text-violet-300"><BarChart3 size={12} /> Visual · {v.type}</span>
            <div className="font-medium">{v.name}</div>
          </Box>
          {reason.root.kind === 'visual' && reason.root.fieldParameter && (
            <>
              <Arrow />
              <Box tone="border-fuchsia-300 bg-fuchsia-50 dark:border-fuchsia-500/40 dark:bg-fuchsia-500/10">
                <span className="flex items-center gap-1 text-xs text-fuchsia-700 dark:text-fuchsia-300"><ListChecks size={12} /> Field Parameter</span>
                <div className="font-medium">{analysis.fieldParameters.get(reason.root.fieldParameter)?.name ?? reason.root.fieldParameter}</div>
              </Box>
            </>
          )}
        </>
      ) : (
        <Box tone="border-slate-200 dark:border-slate-700"><span className="text-xs text-slate-500">Calculated column</span><div>{reason.root.kind === 'column' ? reason.root.column : ''}</div></Box>
      )}
      {chain.map((id, i) => {
        const m = analysis.measures.get(id);
        const last = i === chain.length - 1;
        return (
          <div key={id}>
            <Arrow />
            <Box
              onClick={() => selectMeasure(id)}
              tone={last ? 'border-blue-400 bg-blue-50 font-semibold dark:border-blue-500/50 dark:bg-blue-500/10' : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'}
            >
              {m?.name ?? id} <span className="text-xs font-normal text-slate-500">{m?.table}</span>
            </Box>
          </div>
        );
      })}
    </div>
  );
}

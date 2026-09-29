import { Download } from 'lucide-react';
import { useApp } from '../../state/AppState';
import { downloadBlob, toCsv, toJson, toXlsxBytes } from '../../utils/export';

export function ExportMenu() {
  const { analysis } = useApp();
  return (
    <div className="flex items-center gap-1.5">
      <span className="hidden items-center gap-1 text-xs text-slate-500 sm:flex"><Download size={14} /> Export</span>
      <button className="btn" onClick={() => downloadBlob('measures.csv', '﻿' + toCsv(analysis), 'text/csv;charset=utf-8')}>CSV</button>
      <button className="btn" onClick={() => downloadBlob('dependencies.json', toJson(analysis), 'application/json')}>JSON</button>
      <button
        className="btn"
        onClick={async () =>
          downloadBlob('measure-analysis.xlsx', (await toXlsxBytes(analysis)) as BlobPart, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        }
      >
        Excel
      </button>
    </div>
  );
}

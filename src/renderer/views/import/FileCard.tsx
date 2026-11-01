import { useRef, useState } from 'react';
import { Card, Eyebrow, MerchantMark } from '../../components/ui';

export const EXPLANATION =
  'Quicken cannot share its own .QDF file. In Quicken choose File › Export › Register Transactions to CSV File, then pick that file here.';

interface FileCardProps {
  readonly fileName: string | null;
  readonly summary: string | null;
  readonly onFile: (file: File) => void;
}

export function FileCard({ fileName, summary, onFile }: FileCardProps): React.JSX.Element {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const drop = (event: React.DragEvent): void => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) onFile(file);
  };
  return (
    <Card style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Eyebrow>File</Eyebrow>
      {fileName && (
        <div className="ds-row">
          <MerchantMark name="Q" color="var(--color-cat-7)" />
          <div>
            <div style={{ fontWeight: 600 }}>{fileName}</div>
            {summary && <div className="ds-faint" style={{ fontSize: 11.5 }}>{summary}</div>}
          </div>
        </div>
      )}
      <div className="ds-faint" style={{ fontSize: 12 }}>{EXPLANATION}</div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
        className="ds-faint"
        style={{
          border: `1px dashed ${dragging ? 'var(--color-accent)' : 'var(--color-line-strong)'}`,
          borderRadius: 10,
          padding: 16,
          textAlign: 'center',
          cursor: 'pointer',
        }}
      >
        {fileName ? 'Drop another QFX, OFX, QIF or CSV file' : 'Drop a CSV, QIF, QFX or OFX file'}
      </div>
      <input
        ref={input}
        type="file"
        accept=".csv,.qif,.qfx,.ofx"
        aria-label="Quicken file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = '';
        }}
      />
    </Card>
  );
}

import { Select } from '../../components/ui';
import type { ImportPreview } from '@shared/types';

export interface MoneyCategory {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly isHidden: boolean;
  readonly mergedIntoId: string | null;
}

interface CategoryMappingProps {
  readonly mappings: ImportPreview['categoryMappings'];
  readonly categories: readonly MoneyCategory[];
  readonly selection: {
    readonly choice: Readonly<Record<string, string>>;
    readonly onChoose: (quickenCategory: string, categoryId: string) => void;
  };
}

export function CategoryMapping({
  mappings,
  categories,
  selection,
}: CategoryMappingProps): React.JSX.Element {
  const { choice, onChoose } = selection;
  const usable = categories.filter(
    (c) => !c.isHidden && c.mergedIntoId === null && c.id !== 'uncategorizable',
  );
  return (
    <div
      className="ds-list"
      style={{ maxHeight: 220, overflowY: 'auto' }}
      aria-label="Category mapping"
    >
      {mappings.map((m) => (
        <div key={m.quickenCategory} className="ds-row" style={{ padding: '6px 0' }}>
          <div style={{ flex: 1 }}>
            <div className="ds-num" style={{ fontSize: 12 }}>
              {m.quickenCategory}
            </div>
            <div className="ds-faint" style={{ fontSize: 11.5 }}>
              {m.count} transactions
            </div>
          </div>
          <span className="ds-faint">→</span>
          <Select
            aria-label={`Money category for ${m.quickenCategory}`}
            style={{ width: 220 }}
            value={choice[m.quickenCategory] ?? ''}
            onChange={(e) => onChoose(m.quickenCategory, e.target.value)}
          >
            <option value="">Let Money decide</option>
            {usable.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
      ))}
    </div>
  );
}

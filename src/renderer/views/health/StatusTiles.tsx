import { Card, Chip, Eyebrow, type ChipTone } from '../../components/ui';
import type { HealthData } from './types';

interface Tile {
  readonly title: string;
  readonly tone: ChipTone;
  readonly chip: string;
  readonly line: string;
}

const PROVIDER_NAMES: Record<string, string> = {
  ollama: 'Ollama',
  anthropic: 'Claude',
  local_only: 'History only',
};

function bankSync(data: HealthData): Tile {
  const needsAttention = data.perAccount.some((a) => a.status !== 'healthy');
  const names = data.perAccount.map((a) => `${a.institutionName} ${a.status === 'healthy' ? 'OK' : 'needs sign-in'}`);
  return {
    title: 'Bank sync',
    tone: needsAttention ? 'warn' : 'ok',
    chip: needsAttention ? 'Attention' : 'Working',
    line: names.join(' · ') || 'No bank connected',
  };
}

function categorization({ categorization: model }: HealthData): Tile {
  const name = PROVIDER_NAMES[model.provider] ?? model.provider;
  return {
    title: 'Categorization',
    tone: 'ok',
    chip: 'Working',
    line: model.model ? `${name} · ${model.model}` : name,
  };
}

function encryption({ encryption: state }: HealthData): Tile {
  const ok = state.databaseEncrypted && state.keysInKeychain;
  return {
    title: 'Encryption',
    tone: ok ? 'ok' : 'warn',
    chip: ok ? 'On' : 'Check',
    line: `${state.databaseEncrypted ? 'Database encrypted' : 'Database not encrypted'} · ${
      state.keysInKeychain ? 'key in Keychain' : 'key not in Keychain'
    }`,
  };
}

export function StatusTiles({ data }: { data: HealthData }): React.JSX.Element {
  const tiles: Tile[] = [
    bankSync(data),
    categorization(data),
    encryption(data),
    { title: 'Updates', tone: 'ok', chip: 'Installed', line: `Version ${data.updates.version}` },
  ];
  return (
    <div className="ds-grid grid-cols-4">
      {tiles.map((tile) => (
        <Card key={tile.title}>
          <div className="ds-row">
            <Eyebrow>{tile.title}</Eyebrow>
            <span className="ml-auto">
              <Chip tone={tile.tone}>{tile.chip}</Chip>
            </span>
          </div>
          <div className="mt-2 text-[12.5px]">{tile.line}</div>
        </Card>
      ))}
    </div>
  );
}

'use client';

type Tier = 'auto_confirm' | 'verify' | 'flag';

type JumpBarField = {
  fieldKey: string;
  tier: Tier | null;
};

type JumpBarProps = {
  fields: JumpBarField[];
  activeFieldKey: string | null;
  onJump: (fieldKey: string) => void;
};

const tierColor: Record<Tier, string> = {
  auto_confirm: '#16a34a',
  verify: '#d97706',
  flag: '#dc2626',
};

export default function JumpBar({ fields, activeFieldKey, onJump }: JumpBarProps) {
  if (fields.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        width: 12,
        position: 'relative',
        borderRadius: 999,
        background: '#f5f5f5',
        border: '1px solid #e5e5e5',
      }}
    >
      {fields.map((field, index) => {
        const topPercent =
          fields.length === 1 ? 50 : (index / Math.max(fields.length - 1, 1)) * 100;
        const isActive = activeFieldKey === field.fieldKey;
        return (
          <button
            key={field.fieldKey}
            type="button"
            onClick={() => onJump(field.fieldKey)}
            title={field.fieldKey}
            style={{
              position: 'absolute',
              top: `calc(${topPercent}% - 4px)`,
              left: 1,
              width: 8,
              height: 8,
              borderRadius: 999,
              border: isActive ? '1px solid #111827' : '1px solid transparent',
              background:
                field.tier && tierColor[field.tier] ? tierColor[field.tier] : '#9ca3af',
              cursor: 'pointer',
              padding: 0,
            }}
          />
        );
      })}
    </div>
  );
}

import type { BaselineStatus } from '@/app/lib/api/baselines';

const styles: Record<
  BaselineStatus,
  { background: string; color: string; border: string }
> = {
  draft: { background: '#fef9c3', color: '#854d0e', border: '#fde68a' },
  reviewed: { background: '#e0f2fe', color: '#075985', border: '#bae6fd' },
  confirmed: { background: '#dcfce7', color: '#166534', border: '#bbf7d0' },
  archived: { background: '#f1f5f9', color: '#475569', border: '#e2e8f0' },
};

interface Props {
  status: BaselineStatus;
}

export default function BaselineStatusBadge({ status }: Props) {
  const style = styles[status];

  return (
    <span
      style={{
        padding: '4px 10px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        textTransform: 'capitalize',
        background: style.background,
        color: style.color,
        border: `1px solid ${style.border}`,
      }}
    >
      {status}
    </span>
  );
}

import type { ReactNode } from 'react';

export function cx(...v: Array<string | false | null | undefined>) {
  return v.filter(Boolean).join(' ');
}

export function Panel({ title, right, children, className }: { title?: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cx('rounded-lg border border-slate-700/60 bg-slate-900/70 backdrop-blur-sm', className)}>
      {title && (
        <div className="flex items-center justify-between border-b border-slate-700/60 px-3 py-1.5">
          <h3 className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{title}</h3>
          {right}
        </div>
      )}
      <div className="p-3">{children}</div>
    </div>
  );
}

export function Stat({ label, value, sub, tone = 'default' }: { label: string; value: string; sub?: string; tone?: 'default' | 'good' | 'bad' | 'warn' }) {
  const color = tone === 'good' ? 'text-emerald-400' : tone === 'bad' ? 'text-rose-400' : tone === 'warn' ? 'text-amber-400' : 'text-slate-100';
  return (
    <div className="min-w-0">
      <div className="truncate text-[9px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={cx('truncate font-mono text-sm font-semibold tabular-nums', color)}>{value}</div>
      {sub && <div className="truncate text-[9px] text-slate-500">{sub}</div>}
    </div>
  );
}

export function Btn({ children, onClick, variant = 'default', disabled, className, title }: {
  children: ReactNode; onClick?: () => void; variant?: 'default' | 'primary' | 'danger' | 'ghost' | 'warn';
  disabled?: boolean; className?: string; title?: string;
}) {
  const styles = {
    default: 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-600/60',
    primary: 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400/40',
    danger: 'bg-rose-700 hover:bg-rose-600 text-white border-rose-400/40',
    warn: 'bg-amber-600 hover:bg-amber-500 text-slate-950 border-amber-300/40',
    ghost: 'bg-transparent hover:bg-slate-800/70 text-slate-300 border-transparent',
  }[variant];
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cx('rounded border px-2 py-1 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40', styles, className)}
    >
      {children}
    </button>
  );
}

export function Bar({ value, max = 100, tone = 'emerald', label }: { value: number; max?: number; tone?: string; label?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const color = tone === 'emerald' ? 'bg-emerald-500' : tone === 'rose' ? 'bg-rose-500'
    : tone === 'amber' ? 'bg-amber-500' : tone === 'sky' ? 'bg-sky-500' : 'bg-violet-500';
  return (
    <div className="w-full">
      {label && <div className="mb-0.5 flex justify-between text-[9px] text-slate-500"><span>{label}</span><span className="font-mono">{pct.toFixed(0)}%</span></div>}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
        <div className={cx('h-full rounded-full transition-all duration-500', color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/**
 * Diagnostic tooltip. Hovering a metric explains not just what it is, but what
 * is DRIVING it right now — real numbers from the current state — so the player
 * reasons about the system instead of guessing.
 */
export function Tip({ label, why, children }: {
  label: string; why: string; children?: React.ReactNode;
}) {
  return (
    <span className="group relative inline-flex cursor-help items-center gap-0.5">
      {children ?? <span className="border-b border-dotted border-slate-600">{label}</span>}
      <span className="pointer-events-none absolute bottom-full left-0 z-50 mb-1.5 hidden w-64
        rounded-lg border border-slate-600 bg-slate-900 px-2.5 py-2 text-[10px] font-normal
        leading-relaxed text-slate-200 shadow-2xl group-hover:block">
        <span className="mb-1 block font-semibold text-slate-100">{label}</span>
        {why}
      </span>
    </span>
  );
}

export function Spark({ data, color = '#34d399', height = 34, fill = true }: { data: number[]; color?: string; height?: number; fill?: boolean }) {
  const pts = data.slice(-60);
  if (pts.length < 2) return <div style={{ height }} />;
  const min = Math.min(...pts), max = Math.max(...pts);
  const range = max - min || 1;
  const w = 100;
  const coords = pts.map((v, i) => `${(i / (pts.length - 1)) * w},${height - ((v - min) / range) * (height - 4) - 2}`);
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ height }} className="w-full">
      {fill && <polygon points={`0,${height} ${coords.join(' ')} ${w},${height}`} fill={color} opacity={0.14} />}
      <polyline points={coords.join(' ')} fill="none" stroke={color} strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function Slider({ label, value, min, max, step, onChange, format }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; format?: (v: number) => string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[10px] text-slate-400">
        <span>{label}</span>
        <span className="font-mono text-slate-200">{format ? format(value) : value}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="h-1 w-full cursor-pointer appearance-none rounded-full bg-slate-700 accent-emerald-500"
      />
    </div>
  );
}

export function Tabs({ tabs, active, onChange }: { tabs: string[]; active: string; onChange: (t: string) => void }) {
  return (
    <div className="flex gap-1 border-b border-slate-700/60 px-1">
      {tabs.map(t => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={cx('px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider transition-colors',
            active === t ? 'border-b-2 border-emerald-400 text-emerald-300' : 'text-slate-500 hover:text-slate-300')}
        >{t}</button>
      ))}
    </div>
  );
}

export function Row({ k, v, tone, why }: {
  k: React.ReactNode; v: string; tone?: 'good' | 'bad' | 'muted'; why?: string;
}) {
  // `why` turns the label into a diagnostic tooltip explaining the driver.
  const label = why
    ? <Tip label={typeof k === 'string' ? k : 'Metric'} why={why}><span
        className="border-b border-dotted border-slate-600">{k}</span></Tip>
    : k;
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5 text-[11px]">
      <span className="truncate text-slate-500">{label}</span>
      <span className={cx('font-mono tabular-nums',
        tone === 'good' ? 'text-emerald-400' : tone === 'bad' ? 'text-rose-400' : tone === 'muted' ? 'text-slate-500' : 'text-slate-200')}>{v}</span>
    </div>
  );
}

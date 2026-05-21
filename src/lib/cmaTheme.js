// src/lib/cmaTheme.js
export const theme = {
  bg:        '#0a0e13',
  surface:   '#161b22',
  surface2:  '#1c232c',
  border:    '#21262d',
  borderHi:  '#30363d',
  text:      '#e6edf3',
  textMuted: '#8b949e',
  textDim:   '#6e7681',
  accent:    '#d4a574',
  success:   '#7ec98f',
  danger:    '#e57373',
  warn:      '#e3b341',
  serif:     "'Playfair Display', Georgia, 'Times New Roman', serif",
  sans:      "-apple-system, BlinkMacSystemFont, 'Inter', system-ui, sans-serif",
  mono:      "'JetBrains Mono', 'IBM Plex Mono', 'SF Mono', Menlo, monospace",
};

export const fmt = {
  money:  (n) => n == null ? '—' : '$' + Math.round(n).toLocaleString(),
  moneyK: (n) => n == null ? '—' : '$' + Math.round(n/1000).toLocaleString() + 'K',
  pct:    (n) => n == null ? '—' : Math.round(n) + '%',
  date:   (d) => d == null ? '—' : new Date(d).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
  dateTime: (d) => d == null ? '—' : new Date(d).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
  duration: (s) => {
    if (s == null) return '—';
    if (s < 60) return s + 's';
    const m = Math.floor(s / 60), sec = s % 60;
    return m + 'm ' + sec + 's';
  },
};

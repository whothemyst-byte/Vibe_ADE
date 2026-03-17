export type UiIconName =
  | 'bolt'
  | 'settings'
  | 'layout'
  | 'plus'
  | 'minus'
  | 'close'
  | 'ellipsis'
  | 'palette'
  | 'key'
  | 'board'
  | 'folder'
  | 'user'
  | 'refresh'
  | 'play'
  | 'stop'
  | 'lock';

type UiIconNode =
  | { type: 'path'; d: string }
  | { type: 'circle'; cx: number; cy: number; r: number; fill?: string }
  | { type: 'rect'; x: number; y: number; width: number; height: number; rx?: number; ry?: number }
  | { type: 'line'; x1: number; y1: number; x2: number; y2: number };

const ICON_PATHS: Record<UiIconName, UiIconNode[]> = {
  bolt: [
    { type: 'path', d: 'M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 0 0 0 3.4Z' },
    { type: 'path', d: 'm2 22 3-3' },
    { type: 'path', d: 'M7.5 13.5 10 11' },
    { type: 'path', d: 'M10.5 16.5 13 14' },
    { type: 'path', d: 'm18 3-4 4h6l-4 4' }
  ],
  settings: [
    { type: 'path', d: 'M14 17H5' },
    { type: 'path', d: 'M19 7h-9' },
    { type: 'circle', cx: 17, cy: 17, r: 3 },
    { type: 'circle', cx: 7, cy: 7, r: 3 }
  ],
  layout: [
    { type: 'rect', x: 3, y: 3, width: 7, height: 7, rx: 1 },
    { type: 'rect', x: 14, y: 3, width: 7, height: 7, rx: 1 },
    { type: 'rect', x: 14, y: 14, width: 7, height: 7, rx: 1 },
    { type: 'rect', x: 3, y: 14, width: 7, height: 7, rx: 1 }
  ],
  plus: [{ type: 'path', d: 'M12 5v14' }, { type: 'path', d: 'M5 12h14' }],
  minus: [{ type: 'path', d: 'M5 12h14' }],
  close: [{ type: 'path', d: 'M6 6l12 12' }, { type: 'path', d: 'M18 6l-12 12' }],
  ellipsis: [{ type: 'path', d: 'M12 5h.01' }, { type: 'path', d: 'M12 12h.01' }, { type: 'path', d: 'M12 19h.01' }],
  palette: [
    { type: 'path', d: 'M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z' },
    { type: 'circle', cx: 13.5, cy: 6.5, r: 0.5, fill: 'currentColor' },
    { type: 'circle', cx: 17.5, cy: 10.5, r: 0.5, fill: 'currentColor' },
    { type: 'circle', cx: 6.5, cy: 12.5, r: 0.5, fill: 'currentColor' },
    { type: 'circle', cx: 8.5, cy: 7.5, r: 0.5, fill: 'currentColor' }
  ],
  key: [
    { type: 'path', d: 'M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z' },
    { type: 'circle', cx: 16.5, cy: 7.5, r: 0.5, fill: 'currentColor' }
  ],
  board: [
    { type: 'path', d: 'M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z' },
    { type: 'path', d: 'M8 10v4' },
    { type: 'path', d: 'M12 10v2' },
    { type: 'path', d: 'M16 10v6' }
  ],
  folder: [{ type: 'path', d: 'M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z' }],
  user: [
    { type: 'path', d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' },
    { type: 'path', d: 'M16 3.128a4 4 0 0 1 0 7.744' },
    { type: 'path', d: 'M22 21v-2a4 4 0 0 0-3-3.87' },
    { type: 'circle', cx: 9, cy: 7, r: 4 }
  ],
  refresh: [
    { type: 'path', d: 'M21 12a9 9 0 0 1-9 9 9 9 0 0 1-6.36-2.64' },
    { type: 'path', d: 'M3 12a9 9 0 0 1 9-9 9 9 0 0 1 6.36 2.64' },
    { type: 'path', d: 'M3 16v-4h4' },
    { type: 'path', d: 'M21 8v4h-4' }
  ],
  play: [{ type: 'path', d: 'M8 5v14l11-7z' }],
  stop: [{ type: 'rect', x: 7, y: 7, width: 10, height: 10, rx: 1 }]
  ,
  lock: [
    { type: 'rect', x: 4, y: 10, width: 16, height: 10, rx: 2 },
    { type: 'path', d: 'M8 10V7a4 4 0 0 1 8 0v3' }
  ]
};

export function UiIcon({
  name,
  className,
  title
}: {
  name: UiIconName;
  className?: string;
  title?: string;
}): JSX.Element {
  const nodes = ICON_PATHS[name] ?? ICON_PATHS.bolt;
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : 'presentation'}
    >
      {title && <title>{title}</title>}
      {nodes.map((node, index) => {
        if (node.type === 'path') {
          return <path key={`${name}-p-${index}`} d={node.d} />;
        }
        if (node.type === 'circle') {
          return <circle key={`${name}-c-${index}`} cx={node.cx} cy={node.cy} r={node.r} fill={node.fill} />;
        }
        if (node.type === 'rect') {
          return (
            <rect
              key={`${name}-r-${index}`}
              x={node.x}
              y={node.y}
              width={node.width}
              height={node.height}
              rx={node.rx}
              ry={node.ry}
            />
          );
        }
        return <line key={`${name}-l-${index}`} x1={node.x1} y1={node.y1} x2={node.x2} y2={node.y2} />;
      })}
    </svg>
  );
}

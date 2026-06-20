import type { ReactElement, ReactNode } from "react";
import type { ToolDef } from "./tools";

/** Shared frame for the 24px-grid stroke icons (lucide-style). */
function Svg({ children }: { children: ReactNode }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const SelectIcon = () => (
  <Svg><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" /></Svg>
);
export const HandIcon = () => (
  <Svg>
    <path d="M18 11V6a2 2 0 0 0-4 0v5" />
    <path d="M14 10V4a2 2 0 0 0-4 0v6" />
    <path d="M10 10.5V6a2 2 0 0 0-4 0v8" />
    <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
  </Svg>
);
export const RectangleIcon = () => (
  <Svg><rect x="3" y="5" width="18" height="14" rx="2" /></Svg>
);
export const DiamondIcon = () => (
  <Svg><path d="M12 2.5 21.5 12 12 21.5 2.5 12z" /></Svg>
);
export const EllipseIcon = () => (
  <Svg><circle cx="12" cy="12" r="9" /></Svg>
);
export const ArrowIcon = () => (
  <Svg><path d="M7 17 17 7" /><path d="M8 7h9v9" /></Svg>
);
export const LineIcon = () => (
  <Svg><path d="M5 19 19 5" /></Svg>
);
export const DrawIcon = () => (
  <Svg><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></Svg>
);
export const TextIcon = () => (
  <Svg><path d="M4 7V5h16v2" /><path d="M12 5v15" /><path d="M9 20h6" /></Svg>
);
export const ImageIcon = () => (
  <Svg>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
  </Svg>
);
export const EraserIcon = () => (
  <Svg>
    <path d="m7 21-4.3-4.3a2.4 2.4 0 0 1 0-3.4l9.6-9.6a2.4 2.4 0 0 1 3.4 0l5.6 5.6a2.4 2.4 0 0 1 0 3.4L13 21" />
    <path d="M22 21H7" />
    <path d="m5 11 9 9" />
  </Svg>
);
export const FrameIcon = () => (
  <Svg><path d="M22 6H2" /><path d="M22 18H2" /><path d="M6 2v20" /><path d="M18 2v20" /></Svg>
);

export const BackIcon = () => (
  <Svg><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></Svg>
);
export const FolderIcon = () => (
  <Svg><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></Svg>
);
export const GearIcon = () => (
  <Svg>
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
);
export const UserIcon = () => (
  <Svg>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </Svg>
);
export const TeamsIcon = () => (
  <Svg>
    <path d="M16 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M9 21v-2a4 4 0 0 0-4-4H4" />
    <circle cx="9" cy="7" r="3" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </Svg>
);
export const GridIcon = () => (
  <Svg>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </Svg>
);
export const PaletteIcon = () => (
  <Svg>
    <path d="M12 22a10 10 0 1 1 10-10 5 5 0 0 1-5 5h-2.2a1.8 1.8 0 0 0-1.4 2.9l.3.4a1.8 1.8 0 0 1-1.4 2.9z" />
    <circle cx="13.5" cy="6.5" r=".8" fill="currentColor" />
    <circle cx="17.5" cy="10.5" r=".8" fill="currentColor" />
    <circle cx="8.5" cy="7.5" r=".8" fill="currentColor" />
    <circle cx="6.5" cy="12.5" r=".8" fill="currentColor" />
  </Svg>
);
export const DesignIcon = () => (
  <Svg><path d="M4 7h16" /><path d="M4 17h16" /><path d="M7 4v16" /><path d="M17 4v16" /></Svg>
);
export const ChevronDownIcon = () => <Svg><path d="m6 9 6 6 6-6" /></Svg>;
export const ChevronUpIcon = () => <Svg><path d="m18 15-6-6-6 6" /></Svg>;
export const ChevronRightIcon = () => <Svg><path d="m9 18 6-6-6-6" /></Svg>;
export const FileIcon = () => (
  <Svg><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></Svg>
);
export const PlusIcon = () => <Svg><path d="M5 12h14" /><path d="M12 5v14" /></Svg>;
export const CloseIcon = () => <Svg><path d="M18 6 6 18" /><path d="m6 6 12 12" /></Svg>;
export const MoreIcon = () => <Svg><path d="M12 5h.01" /><path d="M12 12h.01" /><path d="M12 19h.01" /></Svg>;
export const ReloadIcon = () => (
  <Svg><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" /></Svg>
);
export const GlobeIcon = () => (
  <Svg>
    <circle cx="12" cy="12" r="10" />
    <path d="M2 12h20" />
    <path d="M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z" />
  </Svg>
);

export const TOOL_ICONS: Record<ToolDef["type"], () => ReactElement> = {
  selection: SelectIcon,
  hand: HandIcon,
  rectangle: RectangleIcon,
  diamond: DiamondIcon,
  ellipse: EllipseIcon,
  arrow: ArrowIcon,
  line: LineIcon,
  freedraw: DrawIcon,
  text: TextIcon,
  image: ImageIcon,
  eraser: EraserIcon,
  frame: FrameIcon,
};

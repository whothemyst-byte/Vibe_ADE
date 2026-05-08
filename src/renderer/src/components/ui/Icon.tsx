import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ArrowRight,
  Bell,
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CirclePlus,
  ClipboardList,
  Code,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  Folder,
  FolderOpen,
  Globe,
  Heading,
  IdCard,
  Inbox,
  KeyRound,
  LayoutDashboard,
  LayoutGrid,
  ListChecks,
  Lock,
  Mail,
  Menu,
  MessageCircle,
  Minus,
  Moon,
  MoreHorizontal,
  Network,
  Palette,
  PanelLeft,
  PanelLeftOpen,
  Paperclip,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  SlidersHorizontal,
  Square,
  Sun,
  Tag,
  Terminal,
  Trash2,
  Users,
  X,
  Zap,
  type LucideIcon
} from 'lucide-react';
import { cn } from './cn';

const REGISTRY: Record<string, LucideIcon> = {
  // Material-Icon aliases (preserve existing call-site names)
  add: Plus,
  add_circle: CirclePlus,
  archive: Archive,
  arrow_back: ArrowLeft,
  arrow_forward: ArrowRight,
  attach_file: Paperclip,
  badge: IdCard,
  chat_bubble_outline: MessageCircle,
  check: Check,
  checklist: ListChecks,
  chevron_left: ChevronLeft,
  chevron_right: ChevronRight,
  close: X,
  code: Code,
  dark_mode: Moon,
  dashboard: LayoutDashboard,
  delete: Trash2,
  dock_to_left: PanelLeft,
  download: Download,
  edit: Pencil,
  error_outline: CircleAlert,
  folder: Folder,
  folder_open: FolderOpen,
  hub: Network,
  inbox: Inbox,
  light_mode: Sun,
  lock: Lock,
  lock_outline: Lock,
  mail_outline: Mail,
  menu: Menu,
  menu_open: PanelLeftOpen,
  open_in_new: ExternalLink,
  refresh: RefreshCw,
  search: Search,
  sell: Tag,
  send: Send,
  settings: Settings,
  system_update: Download,
  terminal: Terminal,
  title: Heading,
  tune: SlidersHorizontal,
  unarchive: ArchiveRestore,
  visibility: Eye,
  visibility_off: EyeOff,

  // UiIcon-derived names
  bell: Bell,
  board: ClipboardList,
  bolt: Zap,
  bookmark: Bookmark,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  ellipsis: MoreHorizontal,
  eye: Eye,
  'eye-off': EyeOff,
  globe: Globe,
  key: KeyRound,
  layout: LayoutGrid,
  minus: Minus,
  palette: Palette,
  play: Play,
  plus: Plus,
  stop: Square,
  user: Users
};

const sizeMap = { xs: 12, sm: 14, md: 16, lg: 18, xl: 22 } as const;

interface IconProps {
  name: string;
  size?: keyof typeof sizeMap | number;
  className?: string;
}

export function Icon({ name, size = 'md', className }: IconProps): JSX.Element | null {
  const Component = REGISTRY[name];
  if (!Component) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn(`[Icon] unknown name: ${name}`);
    }
    return null;
  }
  const px = typeof size === 'number' ? size : sizeMap[size];
  return (
    <Component
      size={px}
      strokeWidth={1.75}
      className={cn('inline-block shrink-0', className)}
      aria-hidden="true"
    />
  );
}

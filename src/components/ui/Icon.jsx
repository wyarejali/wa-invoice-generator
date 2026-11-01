/**
 * Thin wrapper over Tabler icons (tabler.io/icons, MIT).
 *
 * Call sites use `<Icon name="undo" />` so the underlying set can change
 * without touching every component. Icons are imported by name, so only the
 * ones listed here end up in the bundle.
 */
import {
  IconAdjustmentsHorizontal,
  IconAlertTriangle,
  IconArrowBackUp,
  IconArrowDown,
  IconArrowForwardUp,
  IconArrowUp,
  IconBrandGoogle,
  IconCheck,
  IconCircleCheck,
  IconChevronDown,
  IconChevronRight,
  IconChevronUp,
  IconClock,
  IconCircleFilled,
  IconCloud,
  IconCloudCheck,
  IconCloudOff,
  IconCommand,
  IconCopy,
  IconDots,
  IconDownload,
  IconFileText,
  IconFileTypePdf,
  IconGripVertical,
  IconKeyboard,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconListDetails,
  IconLogin2,
  IconLogout,
  IconMenu2,
  IconMoon,
  IconPalette,
  IconPencil,
  IconPhoto,
  IconPlus,
  IconReceipt,
  IconRefresh,
  IconSearch,
  IconSend,
  IconSelector,
  IconSettings,
  IconSun,
  IconTableColumn,
  IconTrash,
  IconUpload,
  IconUser,
  IconUserCircle,
  IconX,
} from '@tabler/icons-react'

const ICONS = {
  alert: IconAlertTriangle,
  arrowDown: IconArrowDown,
  arrowUp: IconArrowUp,
  check: IconCheck,
  circleCheck: IconCircleCheck,
  chevronDown: IconChevronDown,
  chevronRight: IconChevronRight,
  chevronUp: IconChevronUp,
  cloud: IconCloud,
  cloudOff: IconCloudOff,
  cloudCheck: IconCloudCheck,
  clock: IconClock,
  close: IconX,
  columns: IconTableColumn,
  command: IconCommand,
  copy: IconCopy,
  detail: IconListDetails,
  dots: IconDots,
  download: IconDownload,
  file: IconFileTypePdf,
  fileText: IconFileText,
  google: IconBrandGoogle,
  grip: IconGripVertical,
  image: IconPhoto,
  keyboard: IconKeyboard,
  logIn: IconLogin2,
  logOut: IconLogout,
  menu: IconMenu2,
  moon: IconMoon,
  palette: IconPalette,
  pencil: IconPencil,
  panel: IconAdjustmentsHorizontal,
  plus: IconPlus,
  receipt: IconReceipt,
  railClose: IconLayoutSidebarLeftCollapse,
  railOpen: IconLayoutSidebarLeftExpand,
  redo: IconArrowForwardUp,
  search: IconSearch,
  send: IconSend,
  selector: IconSelector,
  settings: IconSettings,
  sun: IconSun,
  sync: IconRefresh,
  trash: IconTrash,
  undo: IconArrowBackUp,
  upload: IconUpload,
  user: IconUser,
  userCircle: IconUserCircle,
  dot: IconCircleFilled,
}

export default function Icon({ name, size = 16, stroke = 1.75, className = '', ...rest }) {
  const Component = ICONS[name]
  if (!Component) return null
  return (
    <Component
      size={size}
      stroke={stroke}
      className={`shrink-0 ${className}`}
      aria-hidden="true"
      {...rest}
    />
  )
}

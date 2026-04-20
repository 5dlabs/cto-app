import type { CSSProperties, ReactNode } from "react";

export interface IconProps {
  size?: number;
  stroke?: string;
  fill?: string;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

interface BaseProps extends IconProps {
  d?: string;
}

function Icon({
  d,
  size = 16,
  stroke = "currentColor",
  fill = "none",
  className,
  style,
  children,
}: BaseProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke={stroke}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
    >
      {d ? <path d={d} /> : children}
    </svg>
  );
}

export const IconHome = (p: IconProps) => (
  <Icon {...p} d="M3 11l9-8 9 8v10a2 2 0 0 1-2 2h-4v-7h-6v7H5a2 2 0 0 1-2-2V11z" />
);
export const IconDoc = (p: IconProps) => (
  <Icon {...p} d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z" />
);
export const IconDocs = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 3h9a2 2 0 0 1 2 2v12" />
    <path d="M5 7h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z" />
  </Icon>
);
export const IconTerminal = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />
    <path d="M7 9l3 3-3 3" />
    <path d="M13 15h5" />
  </Icon>
);
export const IconApps = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="3" width="7" height="7" />
    <rect x="14" y="3" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" />
  </Icon>
);
export const IconPalette = (p: IconProps) => (
  <Icon {...p} d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2a2 2 0 0 1 2-2h2a3 3 0 0 0 3-3 9 9 0 0 0-9-9z" />
);
export const IconGraph = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 3v18h18" />
    <path d="M7 15l4-4 4 4 5-6" />
  </Icon>
);
export const IconUsers = (p: IconProps) => (
  <Icon {...p}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </Icon>
);
export const IconSettings = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </Icon>
);
export const IconSearch = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
  </Icon>
);
export const IconCommand = (p: IconProps) => (
  <Icon {...p} d="M18 3a3 3 0 1 0-3 3v3M6 3a3 3 0 1 1 3 3v3m0 6v3a3 3 0 1 1-3-3h12a3 3 0 1 1-3 3v-3M9 9h6v6H9z" />
);
export const IconBell = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </Icon>
);
export const IconPlus = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </Icon>
);
export const IconChevRight = (p: IconProps) => <Icon {...p} d="M9 6l6 6-6 6" />;
export const IconChevDown = (p: IconProps) => <Icon {...p} d="M6 9l6 6 6-6" />;
export const IconFolder = (p: IconProps) => (
  <Icon {...p} d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
);
export const IconFile = (p: IconProps) => (
  <Icon {...p} d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z" />
);
export const IconMic = (p: IconProps) => (
  <Icon {...p}>
    <rect x="9" y="3" width="6" height="12" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0" />
    <path d="M12 19v3" />
  </Icon>
);
export const IconVideo = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="6" width="13" height="12" rx="2" />
    <path d="M23 7l-7 5 7 5V7z" />
  </Icon>
);
export const IconChat = (p: IconProps) => (
  <Icon {...p} d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
);
export const IconSend = (p: IconProps) => (
  <Icon {...p} d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
);
export const IconSparkles = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8L12 3z" />
    <path d="M19 14l.9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14z" />
  </Icon>
);
export const IconClose = (p: IconProps) => (
  <Icon {...p}>
    <path d="M18 6L6 18" />
    <path d="M6 6l12 12" />
  </Icon>
);
export const IconExternal = (p: IconProps) => (
  <Icon {...p}>
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <path d="M15 3h6v6" />
    <path d="M10 14L21 3" />
  </Icon>
);
export const IconLock = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </Icon>
);
export const IconRefresh = (p: IconProps) => (
  <Icon {...p}>
    <path d="M23 4v6h-6" />
    <path d="M1 20v-6h6" />
    <path d="M3.5 9a9 9 0 0 1 15-3.5L23 10" />
    <path d="M20.5 15a9 9 0 0 1-15 3.5L1 14" />
  </Icon>
);
export const IconFilter = (p: IconProps) => (
  <Icon {...p} d="M3 4h18l-7 9v7l-4-2v-5L3 4z" />
);
export const IconBolt = (p: IconProps) => (
  <Icon {...p} d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />
);
export const IconBracket = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 4H4v16h4" />
    <path d="M16 4h4v16h-4" />
  </Icon>
);
export const IconGit = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="6" cy="6" r="2" />
    <circle cx="6" cy="18" r="2" />
    <circle cx="18" cy="12" r="2" />
    <path d="M6 8v8" />
    <path d="M16.5 12A6.5 6.5 0 0 0 10 5.5" />
  </Icon>
);

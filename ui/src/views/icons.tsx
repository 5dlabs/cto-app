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
  strokeWidth?: number;
}

function Icon({
  d,
  size = 16,
  stroke = "currentColor",
  fill = "none",
  strokeWidth = 1.6,
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
      strokeWidth={strokeWidth}
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
export const IconOpenAI = (p: IconProps) => (
  <Icon {...p} strokeWidth={1.45}>
    <path d="M12 3.1c1.28 0 2.42.65 3.08 1.64 1.2-.11 2.43.38 3.18 1.48.75 1.08.82 2.4.3 3.47.84.73 1.34 1.8 1.34 3.02 0 1.36-.72 2.58-1.82 3.23-.05 1.2-.7 2.36-1.84 3.03-1.12.66-2.45.62-3.48.02A3.78 3.78 0 0 1 9.67 20c-1.3 0-2.45-.66-3.12-1.67-1.18.08-2.38-.42-3.12-1.48-.73-1.06-.8-2.36-.3-3.42A3.9 3.9 0 0 1 1.8 10.4c0-1.34.7-2.55 1.78-3.21.06-1.2.72-2.35 1.84-3.01 1.12-.66 2.43-.62 3.46-.03A3.78 3.78 0 0 1 12 3.1z" />
    <path d="M8.68 4.16 15.9 8.3v7.36l-6.57 3.78" />
    <path d="m15.08 4.74-7.1 4.1-3.58 6.22" />
    <path d="m18.55 9.69-7.12 4.1H4.26" />
    <path d="m18.08 15.94-7.22-4.18V4.3" />
    <path d="m12.76 18.99-3.6-6.17 3.58-6.2" />
  </Icon>
);
export const IconClaude = (p: IconProps) => (
  <Icon {...p} fill="currentColor" stroke="none">
    <path d="M12 2.7 3.15 21h3.2l1.8-3.95h7.63L17.57 21h3.28L12 2.7Zm-2.68 11.82L12 8.65l2.68 5.87H9.32Z" />
  </Icon>
);
export const IconCursor = (p: IconProps) => (
  <Icon {...p} strokeWidth={1.45}>
    <path d="M4 4l16 5.9-7.2 2.2L10.6 20 4 4z" fill="currentColor" stroke="none" />
    <path d="m12.8 12.1 4.6 4.6" />
  </Icon>
);
export const IconOpenClaw = (p: IconProps) => (
  <Icon {...p} strokeWidth={1.8}>
    <path d="M6.5 5.5 3 12l3.5 6.5" />
    <path d="M17.5 5.5 21 12l-3.5 6.5" />
    <path d="M9.5 8.2 8 12l1.5 3.8" />
    <path d="M14.5 8.2 16 12l-1.5 3.8" />
  </Icon>
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
export const IconChevLeft = (p: IconProps) => <Icon {...p} d="M15 6l-6 6 6 6" />;
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
export const IconGitHub = (p: IconProps) => (
  <Icon {...p} fill="currentColor" stroke="none">
    <path d="M12 2.25a9.75 9.75 0 0 0-3.08 19c.49.09.67-.21.67-.48v-1.72c-2.73.59-3.31-1.18-3.31-1.18-.44-1.13-1.09-1.43-1.09-1.43-.89-.61.07-.6.07-.6.99.07 1.51 1.02 1.51 1.02.87 1.5 2.29 1.07 2.85.82.09-.64.34-1.07.62-1.32-2.18-.25-4.47-1.09-4.47-4.86 0-1.07.38-1.95 1.01-2.64-.1-.25-.44-1.25.1-2.6 0 0 .83-.26 2.7 1.01a9.3 9.3 0 0 1 4.92 0c1.88-1.27 2.7-1.01 2.7-1.01.54 1.35.2 2.35.1 2.6.63.69 1.01 1.57 1.01 2.64 0 3.78-2.3 4.61-4.49 4.85.35.3.67.9.67 1.82v2.7c0 .27.18.58.68.48A9.75 9.75 0 0 0 12 2.25z" />
  </Icon>
);
export const IconGitLab = (p: IconProps) => (
  <Icon {...p} fill="currentColor" stroke="none">
    <path d="M21.74 13.03 20.7 9.84l-2.06-6.33a.7.7 0 0 0-1.33 0l-2.06 6.33H8.75L6.69 3.51a.7.7 0 0 0-1.33 0L3.3 9.84l-1.04 3.19a1.41 1.41 0 0 0 .51 1.58L12 21.32l9.23-6.71a1.41 1.41 0 0 0 .51-1.58zM12 21.32l3.25-11.48h-6.5L12 21.32z" />
  </Icon>
);
export const IconShield = (p: IconProps) => (
  <Icon {...p} d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z" />
);
export const IconDatabase = (p: IconProps) => (
  <Icon {...p}>
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M3 5v6c0 1.7 4 3 9 3s9-1.3 9-3V5" />
    <path d="M3 11v6c0 1.7 4 3 9 3s9-1.3 9-3v-6" />
  </Icon>
);
export const IconCpu = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <rect x="9" y="9" width="6" height="6" />
    <path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3" />
  </Icon>
);
export const IconRadio = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="2" />
    <path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49M20.49 4a10 10 0 0 1 0 16M3.51 20a10 10 0 0 1 0-16" />
  </Icon>
);
export const IconCloud = (p: IconProps) => (
  <Icon {...p} d="M18 10a5 5 0 0 0-9.6-2A4 4 0 1 0 7 17h11a4 4 0 0 0 0-7z" />
);
export const IconHeart = (p: IconProps) => (
  <Icon {...p} d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 22l7.8-8.5 1-1a5.5 5.5 0 0 0 0-7.9z" />
);
export const IconKey = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="7" cy="14" r="4" />
    <path d="M10 11l11-11M17 7l3 3M19 5l3 3" />
  </Icon>
);
export const IconEye = (p: IconProps) => (
  <Icon {...p}>
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);
export const IconEyeOff = (p: IconProps) => (
  <Icon {...p}>
    <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a19.58 19.58 0 0 1 5.17-6.17" />
    <path d="M9.9 4.24A10.93 10.93 0 0 1 12 4c7 0 11 8 11 8a19.5 19.5 0 0 1-2.26 3.3M1 1l22 22" />
  </Icon>
);
export const IconUpload = (p: IconProps) => (
  <Icon {...p}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M17 8l-5-5-5 5M12 3v12" />
  </Icon>
);
export const IconCheck = (p: IconProps) => <Icon {...p} d="M20 6L9 17l-5-5" />;
export const IconCoin = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 6v12M9 9h5a2 2 0 1 1 0 4H9h6" />
  </Icon>
);
export const IconCurrency = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 1v22" />
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </Icon>
);
export const IconPackage = (p: IconProps) => (
  <Icon {...p}>
    <path d="M21 16V8l-9-5-9 5v8l9 5 9-5z" />
    <path d="M3.27 6.96L12 12l8.73-5.04M12 22V12" />
  </Icon>
);
export const IconPuzzle = (p: IconProps) => (
  <Icon {...p} d="M20 10h-2a2 2 0 0 1-2-2V6a2 2 0 0 0-4 0v2a2 2 0 0 1-2 2H8a2 2 0 0 0 0 4h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0v-2a2 2 0 0 1 2-2h2a2 2 0 0 0 0-4z" />
);
export const IconActivity = (p: IconProps) => (
  <Icon {...p} d="M22 12h-4l-3 9L9 3l-3 9H2" />
);
export const IconLink = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
    <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
  </Icon>
);
export const IconGlobe = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="10" />
    <path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" />
  </Icon>
);

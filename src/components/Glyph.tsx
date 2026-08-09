interface GlyphProps {
  name:
    | "command"
    | "forces"
    | "battalion"
    | "ship"
    | "galaxy"
    | "reports"
    | "settings"
    | "target"
    | "route"
    | "clock"
    | "signal";
  size?: number;
}

const paths: Record<GlyphProps["name"], string> = {
  command: "M12 2l3 6 7 .8-5 4.8 1.5 7L12 17l-6.5 3.6 1.5-7-5-4.8L9 8l3-6Z",
  forces: "M4 5h16v4H4V5Zm2 6h12v8H6v-8Zm3 2v4h2v-4H9Zm4 0v4h2v-4h-2Z",
  battalion: "M12 3 3 7v5c0 5 3.8 8.2 9 9 5.2-.8 9-4 9-9V7l-9-4Zm0 4 5 2.1V12c0 2.7-1.8 4.5-5 5.3C8.8 16.5 7 14.7 7 12V9.1L12 7Z",
  ship: "m12 2 4 7-1 10-3 3-3-3-1-10 4-7Zm0 5-1 3v6l1 1 1-1v-6l-1-3Z",
  galaxy: "M12 2a10 10 0 1 0 10 10c0-2.5-3.1-3.8-5.2-2.5-1.7 1-1.2 3.8.8 3.8 1.5 0 2.4-1.6 1.5-2.8M6.2 5.2c1.3.1 2.2 1.4 1.7 2.6-.7 1.7-3.3 1.4-4-.2M7 18c.8-2.2 3.4-2.7 5-1 1.1 1.2.4 3.2-1.2 3.8",
  reports: "M5 3h14v18H5V3Zm3 4v2h8V7H8Zm0 4v2h8v-2H8Zm0 4v2h5v-2H8Z",
  settings: "M12 8.5A3.5 3.5 0 1 0 12 15a3.5 3.5 0 0 0 0-7Zm9 4.8v-2.6l-2.2-.8-.5-1.2 1-2.1-1.9-1.9-2.1 1-1.2-.5L13.3 3h-2.6l-.8 2.2-1.2.5-2.1-1-1.9 1.9 1 2.1-.5 1.2-2.2.8v2.6l2.2.8.5 1.2-1 2.1 1.9 1.9 2.1-1 1.2.5.8 2.2h2.6l.8-2.2 1.2-.5 2.1 1 1.9-1.9-1-2.1.5-1.2 2.2-.8Z",
  target: "M12 3v3a6 6 0 0 0-6 6H3a9 9 0 0 1 9-9Zm0 18v-3a6 6 0 0 0 6-6h3a9 9 0 0 1-9 9Zm9-9h-3a6 6 0 0 0-6-6V3a9 9 0 0 1 9 9ZM3 12h3a6 6 0 0 0 6 6v3a9 9 0 0 1-9-9Zm9-2a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z",
  route: "M5 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm14 10a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM7 7h3c3 0 4 2 4 4s-1 4-4 4H8v2h2c4.5 0 6-3 6-6s-1.5-6-6-6H7v2Z",
  clock: "M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm1 5v4.6l3.2 2-1.1 1.8L11 13V7h2Z",
  signal: "M4 17h3v3H4v-3Zm5-4h3v7H9v-7Zm5-4h3v11h-3V9Zm5-5h3v16h-3V4Z",
};

export function Glyph({ name, size = 20 }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={paths[name]} fill="currentColor" />
    </svg>
  );
}

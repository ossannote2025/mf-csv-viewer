type P = { className?: string };
const base = 'none';
const svg = (d: string) =>
  function Icon({ className = 'size-6' }: P) {
    return (
      <svg viewBox="0 0 24 24" fill={base} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
        <path d={d} />
      </svg>
    );
  };

export const ListIcon = svg('M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01');
export const ChartIcon = svg('M12 3a9 9 0 1 0 9 9h-9V3zM15 3.5A9 9 0 0 1 20.5 9H15V3.5z');
export const SumIcon = svg('M4 20V10M10 20V4M16 20v-7M21 20H3');
export const GearIcon = svg(
  'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
);
export const SearchIcon = svg('M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.3-4.3');
export const FilterIcon = svg('M3 5h18l-7 8.5V19l-4 2v-7.5L3 5z');
export const ChevronLeft = svg('M15 18l-6-6 6-6');
export const ChevronRight = svg('M9 18l6-6-6-6');
export const CloseIcon = svg('M18 6L6 18M6 6l12 12');
export const UploadIcon = svg('M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3');
export const TrashIcon = svg('M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3');
export const EyeIcon = svg('M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z');
export const EyeOffIcon = svg('M3 3l18 18M10.6 10.6a3 3 0 0 0 4.2 4.2M9.9 5.2A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6C3.9 8.4 2 12 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6');
export const LockIcon = svg('M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4');

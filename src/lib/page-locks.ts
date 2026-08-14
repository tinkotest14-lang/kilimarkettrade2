export const PAGE_LOCKS_KEY = 'kili_local_page_locks';

export type PageLockMap = Record<string, boolean>;

export function readPageLocks(): PageLockMap {
  if (typeof window === 'undefined') return {};
  const raw = window.localStorage.getItem(PAGE_LOCKS_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as PageLockMap;
  } catch {
    return {};
  }
}

export function writePageLockEntry(page: string, locked: boolean) {
  if (typeof window === 'undefined') return;
  const current = readPageLocks();
  current[page] = locked;
  window.localStorage.setItem(PAGE_LOCKS_KEY, JSON.stringify(current));
  dispatchPageLockChange();
}

export function dispatchPageLockChange() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('pageLockChange'));
}

export type PageLockItem = {
  path: string;
  label: string;
  search?: { tab: string };
};

export function pageLockKey(page: PageLockItem) {
  return `${page.path}${page.search?.tab ? `?tab=${page.search.tab}` : ""}`;
}

export const NAV_PAGES: PageLockItem[] = [
  { path: "/charts", label: "Charts" },
  { path: "/eabottest", label: "Overview" },
  { path: "/eabottest", label: "Bot Trading", search: { tab: "botting" } },
  { path: "/eabottest", label: "Tools", search: { tab: "tools" } },
  { path: "/profile", label: "Profile" },
];

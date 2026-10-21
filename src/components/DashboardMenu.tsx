import { useState, type ComponentType, type KeyboardEvent, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  LayoutGrid,
  PanelLeftClose,
  PanelLeftOpen,
  Star,
  X,
} from "lucide-react";
import { Wordmark } from "@/components/Wordmark";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  MENU_SECTIONS,
  alertCount,
  arrangeMenu,
  moveFavourite,
  placeFavourite,
  toggleFavourite,
  type MenuBadge,
  type MenuSectionKey,
} from "@/lib/menu";
import type { UiPreferences } from "@/lib/ui-preferences";
import { cn } from "@/lib/utils";

type IconType = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

export interface MenuItemDef {
  to: string;
  label: string;
  icon: IconType;
  badge?: MenuBadge | null;
}

/** A row in the More group: a route, or an action (the setup checklist). */
export interface MoreRowDef {
  key: string;
  label: string;
  icon: IconType;
  badge?: MenuBadge | null;
  to?: string;
  search?: Record<string, string>;
  onSelect?: () => void;
}

export interface MenuBusiness {
  name: string;
  logoUrl: string | null;
  roleLabel: string;
}

interface DashboardMenuProps {
  /** `desktop` can fold to the icon strip; `drawer` is the phone sheet with a close button. */
  variant: "desktop" | "drawer";
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onClose?: () => void;
  items: MenuItemDef[];
  pathname: string;
  preferences: UiPreferences;
  updatePreferences: (patch: UiPreferences) => void;
  moreRows: MoreRowDef[];
  business: MenuBusiness | null;
  businesses: { id: string; tradingName: string }[];
  onSwitchBusiness: (id: string) => void;
  onAddBusiness?: (() => void) | undefined;
  onSignOut: () => void;
  /** Called after any row is chosen (the drawer closes itself). */
  onNavigate?: (() => void) | undefined;
}

const FAVOURITES_KEY = "favourites";

/**
 * The dashboard menu (dashboard-refresh spec): Overview, Favourites, then the four
 * job sections, each foldable; an icon strip when collapsed; the account card and
 * More group at the foot. Favourites are edited in place (stars) and reordered by
 * drag or arrow keys. Everything a person changes here is saved through
 * `updatePreferences` and follows them to other devices.
 */
export function DashboardMenu({
  variant,
  collapsed: collapsedProp,
  onToggleCollapsed,
  onClose,
  items,
  pathname,
  preferences,
  updatePreferences,
  moreRows,
  business,
  businesses,
  onSwitchBusiness,
  onAddBusiness,
  onSignOut,
  onNavigate,
}: DashboardMenuProps) {
  const collapsed = variant === "desktop" && collapsedProp;
  const favourites = preferences.favourites ?? [];
  const closed = new Set(preferences.closedSections ?? []);
  const moreOpen = preferences.moreOpen ?? false;
  const [editing, setEditing] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const menu = arrangeMenu(items, favourites);
  const rowHeight = variant === "drawer" ? "min-h-11" : "min-h-9";

  const isActive = (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));
  const setSectionOpen = (key: string, open: boolean) => {
    const next = new Set(closed);
    if (open) next.delete(key);
    else next.add(key);
    updatePreferences({ closedSections: [...next] });
  };
  const star = (to: string) => updatePreferences({ favourites: toggleFavourite(favourites, to) });
  const alerts = alertCount(moreRows.map((r) => r.badge));

  const sectionHeading = (key: string, heading: string, extra?: ReactNode) => {
    const open = !closed.has(key);
    return (
      <div className="mt-4 flex items-center justify-between gap-2 px-3">
        <button
          type="button"
          onClick={() => setSectionOpen(key, !open)}
          aria-expanded={open}
          aria-controls={`menu-${variant}-section-${key}`}
          className="flex min-h-7 items-center gap-1.5 rounded-md text-[11px] font-semibold tracking-[0.1em] text-muted-foreground/60 uppercase hover:text-muted-foreground"
        >
          {heading}
          {open ? (
            <ChevronDown className="size-3.5" aria-hidden />
          ) : (
            <ChevronRight className="size-3.5" aria-hidden />
          )}
        </button>
        {extra}
      </div>
    );
  };

  const row = (item: MenuItemDef, opts: { favourite?: boolean } = {}) => {
    const active = isActive(item.to);
    const Icon = item.icon;
    const starred = favourites.includes(item.to);
    const canStar = item.to !== "/";
    if (collapsed) {
      return (
        <li key={item.to}>
          <StripLink
            to={item.to}
            label={item.label}
            active={active}
            badge={item.badge ?? null}
            onNavigate={onNavigate}
          >
            <Icon className="size-[18px]" aria-hidden />
          </StripLink>
        </li>
      );
    }
    const draggable = editing && opts.favourite === true;
    return (
      <li
        key={item.to}
        className={cn("flex items-center gap-1", dragging === item.to && "opacity-50")}
        draggable={draggable || undefined}
        onDragStart={draggable ? () => setDragging(item.to) : undefined}
        onDragEnd={draggable ? () => setDragging(null) : undefined}
        onDragOver={opts.favourite && editing && dragging ? (e) => e.preventDefault() : undefined}
        onDrop={
          opts.favourite && editing && dragging
            ? () => {
                updatePreferences({ favourites: placeFavourite(favourites, dragging, item.to) });
                setDragging(null);
              }
            : undefined
        }
      >
        {draggable ? (
          <button
            type="button"
            className="flex size-7 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
            aria-label={`Reorder ${item.label}: use the up and down arrow keys`}
            onKeyDown={(e: KeyboardEvent<HTMLButtonElement>) => {
              if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
              e.preventDefault();
              updatePreferences({
                favourites: moveFavourite(favourites, item.to, e.key === "ArrowUp" ? "up" : "down"),
              });
            }}
          >
            <GripVertical className="size-4" aria-hidden />
          </button>
        ) : null}
        <Link
          to={item.to}
          onClick={onNavigate}
          aria-current={active ? "page" : undefined}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-3 rounded-[10px] px-3 py-1.5 text-[14.5px] font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
            rowHeight,
            active && "bg-sidebar-accent font-bold text-foreground shadow-active-row",
          )}
        >
          <Icon className={cn("size-[18px] shrink-0", active && "text-foreground")} aria-hidden />
          <span className="truncate">{item.label}</span>
          <span className="ml-auto flex shrink-0 items-center gap-2">
            {item.badge ? <Badge badge={item.badge} /> : null}
            {active ? <span className="size-[7px] rounded-full bg-mint" aria-hidden /> : null}
            {starred && !editing ? (
              <Star className="size-3.5 fill-star text-star" aria-hidden />
            ) : null}
          </span>
        </Link>
        {editing && canStar ? (
          <button
            type="button"
            onClick={() => star(item.to)}
            aria-pressed={starred}
            aria-label={
              starred ? `Remove ${item.label} from favourites` : `Add ${item.label} to favourites`
            }
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-star focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <Star className={cn("size-4", starred && "fill-star text-star")} aria-hidden />
          </button>
        ) : null}
      </li>
    );
  };

  const strip = collapsed;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex h-full min-h-0 flex-col text-foreground">
        {/* Logo and the menu toggle. */}
        <div
          className={cn(
            "flex shrink-0 items-center px-3 pt-4 pb-2",
            strip ? "flex-col gap-2" : "justify-between pl-4",
          )}
        >
          <Wordmark compact={strip} />
          {variant === "drawer" ? (
            <IconButton label="Close menu" onClick={onClose}>
              <X className="size-5" aria-hidden />
            </IconButton>
          ) : (
            <IconButton
              label={collapsed ? "Expand menu" : "Collapse menu"}
              onClick={onToggleCollapsed}
              expanded={!collapsed}
            >
              {collapsed ? (
                <PanelLeftOpen className="size-5" aria-hidden />
              ) : (
                <PanelLeftClose className="size-5" aria-hidden />
              )}
            </IconButton>
          )}
        </div>

        <nav
          aria-label="Main"
          className={cn("no-scrollbar min-h-0 flex-1 overflow-y-auto px-3 pb-2", strip && "px-2")}
        >
          {menu.overview ? <ul className="space-y-0.5">{row(menu.overview)}</ul> : null}

          {/* Favourites */}
          {strip ? (
            menu.favourites.length > 0 ? (
              <>
                <ul className="mt-2 space-y-0.5">
                  {menu.favourites.map((item) => row(item, { favourite: true }))}
                </ul>
                <StripRule />
              </>
            ) : null
          ) : (
            <>
              {sectionHeading(
                FAVOURITES_KEY,
                "Favourites",
                <button
                  type="button"
                  onClick={() => setEditing((v) => !v)}
                  aria-pressed={editing}
                  className={cn(
                    "min-h-7 rounded-md px-2 text-[12px] font-semibold hover:bg-sidebar-accent/70",
                    editing ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {editing ? "Done" : "Edit"}
                </button>,
              )}
              {!closed.has(FAVOURITES_KEY) ? (
                <div id={`menu-${variant}-section-${FAVOURITES_KEY}`}>
                  {menu.favourites.length > 0 ? (
                    <ul className="mt-1 space-y-0.5">
                      {menu.favourites.map((item) => row(item, { favourite: true }))}
                    </ul>
                  ) : (
                    <p className="mt-1 px-3 text-[12.5px] leading-snug text-muted-foreground">
                      Tap Edit, then the star next to anything you use a lot.
                    </p>
                  )}
                </div>
              ) : null}
            </>
          )}

          {/* Sections */}
          {menu.sections.map((section, index) => (
            <div key={section.key}>
              {strip ? (
                <>
                  {index > 0 || menu.favourites.length > 0 ? null : <StripRule />}
                  <ul className="space-y-0.5">{section.items.map((item) => row(item))}</ul>
                  {index < menu.sections.length - 1 ? <StripRule /> : null}
                </>
              ) : (
                <>
                  {sectionHeading(section.key, section.heading)}
                  {!closed.has(section.key as MenuSectionKey) ? (
                    <ul id={`menu-${variant}-section-${section.key}`} className="mt-1 space-y-0.5">
                      {section.items.map((item) => row(item))}
                    </ul>
                  ) : null}
                </>
              )}
            </div>
          ))}
        </nav>

        {/* Account card + More */}
        <div className={cn("shrink-0 px-3 pt-2 pb-3", strip && "px-2")}>
          {/* Grid-row animation: the list stays in the DOM so the height can tween; `inert` keeps it out of the tab order while closed. */}
          <div
            className={cn(
              "grid transition-[grid-template-rows,opacity,margin] duration-200 ease-out motion-reduce:transition-none",
              moreOpen ? "mb-2 grid-rows-[1fr] opacity-100" : "mb-0 grid-rows-[0fr] opacity-0",
            )}
          >
            <ul
              id={`menu-${variant}-more`}
              inert={!moreOpen}
              aria-hidden={!moreOpen}
              className={cn(
                "min-h-0 space-y-0.5 overflow-hidden rounded-[14px] bg-secondary transition-[padding] duration-200 ease-out motion-reduce:transition-none",
                moreOpen && "p-1.5",
                strip && moreOpen && "p-1",
              )}
            >
              {moreRows.map((r) => (
                <li key={r.key}>
                  {strip ? (
                    r.to ? (
                      <StripLink
                        to={r.to}
                        search={r.search}
                        label={r.label}
                        active={isActive(r.to)}
                        badge={r.badge ?? null}
                        onNavigate={onNavigate}
                      >
                        <r.icon className="size-[18px]" aria-hidden />
                      </StripLink>
                    ) : (
                      <StripButton
                        label={r.label}
                        badge={r.badge ?? null}
                        onClick={() => {
                          r.onSelect?.();
                          onNavigate?.();
                        }}
                      >
                        <r.icon className="size-[18px]" aria-hidden />
                      </StripButton>
                    )
                  ) : r.to ? (
                    <Link
                      to={r.to}
                      search={r.search}
                      onClick={onNavigate}
                      aria-current={isActive(r.to) ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-[10px] px-3 py-1.5 text-[14.5px] font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
                        rowHeight,
                        isActive(r.to) &&
                          "bg-sidebar-accent font-bold text-foreground shadow-active-row",
                      )}
                    >
                      <r.icon className="size-[18px] shrink-0" aria-hidden />
                      <span className="truncate">{r.label}</span>
                      {r.badge ? (
                        <span className="ml-auto">
                          <Badge badge={r.badge} />
                        </span>
                      ) : null}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        r.onSelect?.();
                        onNavigate?.();
                      }}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-[10px] px-3 py-1.5 text-left text-[14.5px] font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
                        rowHeight,
                      )}
                    >
                      <r.icon className="size-[18px] shrink-0" aria-hidden />
                      <span className="truncate">{r.label}</span>
                      {r.badge ? (
                        <span className="ml-auto">
                          <Badge badge={r.badge} />
                        </span>
                      ) : null}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div
            className={cn("flex gap-2", strip ? "flex-col-reverse items-center" : "items-stretch")}
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={business ? `${business.name}: account menu` : "Account menu"}
                  className={cn(
                    "flex items-center gap-3 rounded-[14px] bg-secondary text-left transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
                    strip ? "size-12 justify-center" : "min-h-12 min-w-0 flex-1 px-2.5 py-2",
                  )}
                >
                  <BusinessLogo business={business} />
                  {strip ? null : (
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-[13px] leading-tight font-semibold text-foreground">
                        {business?.name ?? "Loading…"}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                        {business?.roleLabel ?? ""}
                      </span>
                    </span>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="top" className="w-60">
                {businesses.length > 1 ? (
                  <>
                    <DropdownMenuLabel>Switch business</DropdownMenuLabel>
                    {businesses.map((b) => (
                      <DropdownMenuItem key={b.id} onClick={() => onSwitchBusiness(b.id)}>
                        {b.tradingName}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                  </>
                ) : null}
                {onAddBusiness ? (
                  <DropdownMenuItem onClick={onAddBusiness}>Add a business</DropdownMenuItem>
                ) : null}
                <DropdownMenuItem asChild>
                  <Link to="/settings/$page" params={{ page: "profile" }} onClick={onNavigate}>
                    Your account
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onSignOut}>Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <button
              type="button"
              onClick={() => updatePreferences({ moreOpen: !moreOpen })}
              aria-expanded={moreOpen}
              aria-controls={`menu-${variant}-more`}
              aria-label={
                alerts > 0 && !moreOpen
                  ? `More options: ${alerts} need${alerts === 1 ? "s" : ""} attention`
                  : "More options"
              }
              className={cn(
                "relative flex w-12 shrink-0 items-center justify-center rounded-[14px] bg-secondary text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
                strip ? "h-12" : "min-h-12 self-stretch",
              )}
            >
              {moreOpen ? (
                <ChevronDown className="size-5" aria-hidden />
              ) : (
                <LayoutGrid className="size-5" aria-hidden />
              )}
              {!moreOpen && alerts > 0 ? (
                <span
                  aria-hidden
                  className="absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-amber px-1 text-[10px] font-bold text-white"
                >
                  {alerts}
                </span>
              ) : null}
            </button>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

function IconButton({
  label,
  onClick,
  expanded,
  children,
}: {
  label: string;
  onClick?: (() => void) | undefined;
  expanded?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-expanded={expanded}
      className="flex size-9 items-center justify-center rounded-[10px] text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      {children}
    </button>
  );
}

function StripRule() {
  return <hr className="mx-3 my-2 border-sidebar-border" aria-hidden />;
}

/** One icon in the collapsed strip: tooltip for the name, dot on the icon when active. */
function StripLink({
  to,
  search,
  label,
  active,
  badge,
  onNavigate,
  children,
}: {
  to: string;
  search?: Record<string, string> | undefined;
  label: string;
  active: boolean;
  badge: MenuBadge | null;
  onNavigate?: (() => void) | undefined;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          to={to}
          search={search}
          onClick={onNavigate}
          aria-label={badge ? `${label}, ${badge.text}` : label}
          aria-current={active ? "page" : undefined}
          className={cn(
            "relative mx-auto flex size-10 items-center justify-center rounded-[10px] text-sidebar-foreground transition-colors hover:bg-sidebar-accent/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
            active && "bg-sidebar-accent text-foreground shadow-active-row",
          )}
        >
          {children}
          {active ? (
            <span
              className="absolute top-1.5 right-1.5 size-[7px] rounded-full bg-mint"
              aria-hidden
            />
          ) : null}
          {badge ? <StripBadge badge={badge} /> : null}
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right">{badge ? `${label} · ${badge.text}` : label}</TooltipContent>
    </Tooltip>
  );
}

function StripButton({
  label,
  badge,
  onClick,
  children,
}: {
  label: string;
  badge: MenuBadge | null;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={badge ? `${label}, ${badge.text}` : label}
          className="relative mx-auto flex size-10 items-center justify-center rounded-[10px] text-sidebar-foreground transition-colors hover:bg-sidebar-accent/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          {children}
          {badge ? <StripBadge badge={badge} /> : null}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{badge ? `${label} · ${badge.text}` : label}</TooltipContent>
    </Tooltip>
  );
}

const BADGE_TONE: Record<MenuBadge["tone"], string> = {
  amber: "bg-amber text-white",
  mint: "bg-mint text-navy",
  grey: "bg-sidebar-border text-sidebar-foreground",
};

function Badge({ badge }: { badge: MenuBadge }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] leading-none font-bold tabular-nums",
        BADGE_TONE[badge.tone],
      )}
    >
      {badge.text}
    </span>
  );
}

/** In the strip a badge is a small count pinned to the icon's corner. */
function StripBadge({ badge }: { badge: MenuBadge }) {
  const short = /^\d+$/.test(badge.text) ? badge.text : "•";
  return (
    <span
      aria-hidden
      className={cn(
        "absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] leading-none font-bold",
        BADGE_TONE[badge.tone],
      )}
    >
      {short}
    </span>
  );
}

function BusinessLogo({ business }: { business: MenuBusiness | null }) {
  if (business?.logoUrl) {
    return (
      <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-white ring-1 ring-black/5">
        <img
          src={business.logoUrl}
          alt=""
          className="size-full object-contain"
          width={36}
          height={36}
        />
      </span>
    );
  }
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-navy text-[12px] font-bold text-white">
      {(business?.name ?? "RE").slice(0, 2).toUpperCase()}
    </span>
  );
}

export { MENU_SECTIONS };

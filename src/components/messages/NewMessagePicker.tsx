import { useState } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useCustomers, useOpenConversation } from "@/lib/api/hooks";
import { useInbox } from "@/lib/api/messages";
import { customerDisplayName } from "@/lib/api/types";
import { rowName } from "@/lib/messages";
import { ClientAvatar } from "./parts";

type ClientOption = { id: string; name: string; detail: string | null };

/**
 * "New message": pick any client. Recent conversations come first; typing searches the
 * whole client book. Picking opens their conversation (a new empty one if needed).
 */
export function NewMessagePicker({
  open,
  onOpenChange,
  onOpened,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpened: (conversationId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const term = useDebouncedValue(search.trim());
  const searching = term.length > 1;
  const recent = useInbox({ tab: "all", search: "" });
  const results = useCustomers({ search: term, enabled: open && searching });
  const openConversation = useOpenConversation();

  const recentPicks: ClientOption[] = recent.items.slice(0, 8).map((r) => ({
    id: r.customer.id,
    name: rowName(r),
    detail: r.customer.phone ?? r.customer.email,
  }));
  const searchPicks: ClientOption[] = (results.data?.items ?? []).slice(0, 50).map((c) => ({
    id: c.id,
    name: customerDisplayName(c),
    detail: c.phoneDisplay ?? c.emailDisplay ?? null,
  }));
  const picks = searching ? searchPicks : recentPicks;

  const choose = async (customerId: string) => {
    const conversation = await openConversation.mutateAsync({ customerId });
    setSearch("");
    onOpened(conversation.id);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setSearch("");
        onOpenChange(o);
      }}
    >
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-[460px]">
        <DialogHeader className="px-5 pt-5 pb-3 text-left">
          <DialogTitle className="text-[20px] font-extrabold">New message</DialogTitle>
          <DialogDescription>Pick a client to message.</DialogDescription>
        </DialogHeader>
        <Command shouldFilter={false} className="border-t">
          <CommandInput
            placeholder="Search clients by name, phone or email"
            value={search}
            onValueChange={setSearch}
            aria-label="Search clients"
          />
          <CommandList className="max-h-[min(380px,55dvh)]">
            {searching && results.isLoading ? (
              <p className="px-4 py-5 text-sm text-muted-foreground">Searching…</p>
            ) : picks.length === 0 ? (
              <CommandEmpty>
                {searching ? `No clients match "${term}"` : "Type a name to find a client."}
              </CommandEmpty>
            ) : (
              <CommandGroup heading={searching ? "Clients" : "Recent"}>
                {picks.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={p.id}
                    disabled={openConversation.isPending}
                    onSelect={() => void choose(p.id)}
                    className="min-h-11 gap-3"
                  >
                    <ClientAvatar id={p.id} name={p.name} size={32} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{p.name}</span>
                      {p.detail ? (
                        <span className="block truncate text-xs text-muted-foreground">
                          {p.detail}
                        </span>
                      ) : null}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

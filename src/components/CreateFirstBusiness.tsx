import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, newIdempotencyKey, queryKeys, toastApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Wordmark } from "@/components/Wordmark";
import { useAuth } from "@/lib/auth/auth-store";

const INDUSTRY_TEMPLATES = [
  { key: "general_appointments", name: "General appointments" },
  { key: "personal_training", name: "Personal training" },
  { key: "car_detailing", name: "Car detailing" },
  { key: "barbering", name: "Barbering" },
] as const;

/**
 * First-run onboarding for a signed-in account with no business membership.
 * Calls POST /api/v1/businesses, which provisions the owner membership and
 * applies the chosen industry template.
 */
export function CreateFirstBusiness() {
  const queryClient = useQueryClient();
  const { signOut } = useAuth();
  const [legalName, setLegalName] = useState("");
  const [tradingName, setTradingName] = useState("");
  const [industryTemplateKey, setIndustryTemplateKey] = useState<string>(INDUSTRY_TEMPLATES[0].key);

  const create = useMutation({
    mutationFn: async () => {
      const res = await api.post<{ business?: { id: string } }>(
        "/api/v1/businesses",
        {
          legalName: legalName.trim(),
          ...(tradingName.trim() ? { tradingName: tradingName.trim() } : {}),
          industryTemplateKey,
        },
        { idempotencyKey: newIdempotencyKey() },
      );
      return res.data;
    },
    onSuccess: async () => {
      toast.success("Business created");
      await queryClient.invalidateQueries({ queryKey: queryKeys.myBusinesses() });
    },
    onError: (err) => toastApiError(err),
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center">
          <Wordmark />
        </div>
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <h1 className="text-xl font-semibold tracking-tight">Create your business</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your account isn't linked to a business yet. Set one up to get started.
          </p>

          <form
            className="mt-6 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!legalName.trim()) {
                toast.error("Enter a business name");
                return;
              }
              create.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="legalName">Business name</Label>
              <Input
                id="legalName"
                required
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                placeholder="Acme Detailing Ltd"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tradingName">Trading name (optional)</Label>
              <Input
                id="tradingName"
                value={tradingName}
                onChange={(e) => setTradingName(e.target.value)}
                placeholder="Acme Detailing"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="industry">Industry</Label>
              <Select value={industryTemplateKey} onValueChange={setIndustryTemplateKey}>
                <SelectTrigger id="industry">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INDUSTRY_TEMPLATES.map((t) => (
                    <SelectItem key={t.key} value={t.key}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Sets default terminology and configuration. You can adjust settings later.
              </p>
            </div>

            <Button type="submit" className="w-full" disabled={create.isPending}>
              {create.isPending ? "Creating…" : "Create business"}
            </Button>
          </form>

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => void signOut()}
              className="text-sm text-muted-foreground hover:underline"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

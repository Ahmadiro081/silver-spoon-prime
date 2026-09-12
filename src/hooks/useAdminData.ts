import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAdminOverview, type AdminOverview } from "@/lib/admin.functions";

export function useAdminOverview() {
  const fetchOverview = useServerFn(getAdminOverview);
  const queryClient = useQueryClient();
  const query = useQuery<AdminOverview>({
    queryKey: ["admin-overview"],
    queryFn: () => fetchOverview(),
  });
  return {
    ...query,
    refresh: () => queryClient.invalidateQueries({ queryKey: ["admin-overview"] }),
  };
}

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" });

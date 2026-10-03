<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Server code never uses the service-role client: admin actions run through the admin's own session (RLS), and payment status writes go through the `server_set_txn_status` DB function, which checks a hash of the Paystack secret — so the app runs on hosts without the master key (e.g. Vercel).
- vite.config.ts sets the nitro `vercel` preset only when `VERCEL` is set at build time; Lovable hosting keeps its default.

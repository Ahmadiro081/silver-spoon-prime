import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

export const Route = createFileRoute("/api/public/webhooks/paystack")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["PAYSTACK_SECRET_KEY"] ?? process.env["STRIPE_LIVE_API_KEY"];
        if (!secret) return new Response("Not configured", { status: 503 });

        const body = await request.text();
        const signature = request.headers.get("x-paystack-signature") ?? "";
        const expected = createHmac("sha512", secret).update(body).digest("hex");
        const sig = Buffer.from(signature);
        const exp = Buffer.from(expected);
        if (sig.length !== exp.length || !timingSafeEqual(sig, exp)) {
          return new Response("Invalid signature", { status: 401 });
        }

        const event = JSON.parse(body) as {
          event?: string;
          data?: { reference?: string; transfer_code?: string; status?: string };
        };
        const name = event.event ?? "";
        const ref = event.data?.transfer_code ?? event.data?.reference;
        if (!ref) return new Response("ok");

        const status =
          name === "charge.success" || name === "transfer.success"
            ? "Completed"
            : name === "transfer.failed" || name === "transfer.reversed"
              ? "Failed"
              : null;
        if (!status) return new Response("ok");

        const { serverSetTxnStatus } = await import("@/lib/paystack.server");
        await serverSetTxnStatus(ref, status);

        return new Response("ok");
      },
    },
  },
});

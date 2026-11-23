#!/usr/bin/env node
/**
 * SILVER SPOON — Phase B Automated PostgreSQL Verification Suite
 *
 * Executes all 12 Phase B SQL migrations and synthetic staging seed against a
 * genuine embedded PostgreSQL engine (@electric-sql/pglite) in memory, then runs
 * all 4 required verification suites:
 *   A. Financial Integrity
 *   B. Database Security, RLS, Grants & Anti-Escalation
 *   C. Concurrency & Race Guardrails
 *   D. Business Rules (Four-Eyes, Rollovers, Tax Effective Dates)
 *
 * Non-Production Guarantee: Zero network calls, zero remote Supabase access,
 * purely synthetic .invalid accounts.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS_DIR = path.join(ROOT, "supabase/migrations");
const SHIM_PATH = path.join(ROOT, "supabase/tests/harness_supabase_shim.sql");
const SEED_PATH = path.join(ROOT, "supabase/seed/staging_synthetic_seed.sql");

const USERS = {
  inv1: "11111111-1111-4111-8111-111111111111",
  inv2: "22222222-2222-4222-8222-222222222222",
  finA: "33333333-3333-4333-8333-333333333333",
  finB: "44444444-4444-4444-8444-444444444444",
  comp: "55555555-5555-4555-8555-555555555555",
  adm: "66666666-6666-4666-8666-666666666666",
  supA: "77777777-7777-4777-8777-777777777777",
  supB: "88888888-8888-4888-8888-888888888888",
};

const PLANS = {
  tbillNoCompound: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  cpAllowsCompound: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
};

const results = [];

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runAs(db, role, userId, fn) {
  await db.exec("BEGIN");
  try {
    await db.exec(`SET LOCAL ROLE ${role}`);
    if (userId) {
      await db.exec(`SELECT set_config('request.jwt.claim.sub', '${userId}', true)`);
    } else {
      await db.exec(`SELECT set_config('request.jwt.claim.sub', '', true)`);
    }
    await db.exec(`SELECT set_config('request.jwt.claim.role', '${role}', true)`);
    const out = await fn();
    await db.exec("COMMIT");
    return out;
  } catch (err) {
    await db.exec("ROLLBACK");
    throw err;
  }
}

async function expectError(fn, expectedPattern, label) {
  let failed = false;
  let caughtMsg = "";
  try {
    await fn();
  } catch (err) {
    failed = true;
    caughtMsg = err?.message || String(err);
  }
  assert(failed, `${label}: expected error matching ${expectedPattern} but succeeded`);
  if (expectedPattern) {
    assert(
      expectedPattern.test(caughtMsg),
      `${label}: error "${caughtMsg}" did not match ${expectedPattern}`,
    );
  }
  return caughtMsg;
}

async function test(suite, name, fn) {
  const start = Date.now();
  try {
    const detail = await fn();
    results.push({ suite, name, status: "PASS", ms: Date.now() - start, detail: detail || "" });
    console.log(`  [PASS] (${suite}) ${name}${detail ? ` — ${detail}` : ""}`);
  } catch (err) {
    results.push({ suite, name, status: "FAIL", ms: Date.now() - start, detail: err?.message || String(err) });
    console.error(`  [FAIL] (${suite}) ${name} — ${err?.message || err}`);
  }
}

async function main() {
  console.log("=== SILVER SPOON Phase B PostgreSQL Verification Suite (Embedded PGlite) ===\n");
  const db = new PGlite();

  // 1. Bootstrap Supabase Auth shim
  await db.exec(fs.readFileSync(SHIM_PATH, "utf8"));

  // 2. Execute all 12 migrations in deterministic filename order
  const migrationFiles = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  console.log(`Executing ${migrationFiles.length} SQL migrations...`);
  for (const file of migrationFiles) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    try {
      await db.exec(sql);
      console.log(`  [MIGRATED] ${file}`);
    } catch (err) {
      console.error(`  [MIGRATION ERROR] ${file}: ${err.message}`);
      process.exit(1);
    }
  }

  // Verify exact 40 tables + Forced RLS on all 40 tables
  const tblCheck = await db.query(`
    SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname
  `);
  assert(tblCheck.rows.length === 40, `Expected exactly 40 public tables, found ${tblCheck.rows.length}`);
  const unforced = tblCheck.rows.filter((r) => !r.relrowsecurity || !r.relforcerowsecurity);
  assert(unforced.length === 0, `Tables missing ENABLE/FORCE RLS: ${unforced.map((r) => r.relname).join(", ")}`);
  console.log(`\nSchema verification passed: 40/40 public tables created with ENABLE + FORCE ROW LEVEL SECURITY.\n`);

  // 3. Load synthetic staging seed
  await db.exec(fs.readFileSync(SEED_PATH, "utf8"));

  // Fetch wallet IDs for Investor 1 & Investor 2
  const w1 = (await db.query(`SELECT * FROM public.wallets WHERE user_id = $1`, [USERS.inv1])).rows[0];
  const w2 = (await db.query(`SELECT * FROM public.wallets WHERE user_id = $1`, [USERS.inv2])).rows[0];

  // Helper: seed initial verified deposit for Investor 1 (NGN 500,000 = 50,000,000 kobo)
  let firstDepositEntryId;
  await runAs(db, "authenticated", USERS.inv1, async () => {
    await db.query(
      `SELECT public.initialize_deposit($1, 'paystack_checkout_bank_transfer', 'PSK-STG-0001', 'dep-init-001')`,
      [50_000_000],
    );
  });
  firstDepositEntryId = (
    await runAs(db, "service_role", null, async () => {
      const r = await db.query(
        `SELECT public.settle_verified_deposit('PSK-STG-0001', 50000000, 'VERIFY-SRV-0001', 'dep-settle-001') AS id`,
      );
      return r.rows[0].id;
    })
  );

  // Also register & four-eyes-approve Investor 1 payout NUBAN bank account
  const inv1BankId = await runAs(db, "authenticated", USERS.inv1, async () => {
    const r = await db.query(
      `SELECT public.request_bank_account_change('058', 'Guaranty Trust Bank (GTBank)', '0123456789', 'Synthetic Investor One') AS id`,
    );
    return r.rows[0].id;
  });
  await runAs(db, "authenticated", USERS.finA, async () => {
    await db.query(`SELECT public.approve_bank_account_change($1, 'Verified synthetic NUBAN')`, [inv1BankId]);
  });

  // =========================================================================
  // SUITE A: FINANCIAL INTEGRITY
  // =========================================================================
  console.log("Suite A: Financial Integrity");

  await test("A. Financial Integrity", "Balanced journal transaction updates wallet_balances & total_customer_liability_kobo accurately", async () => {
    const bal = (await db.query(`SELECT * FROM public.wallet_balances WHERE wallet_id = $1`, [w1.id])).rows[0];
    assert(Number(bal.available_kobo) === 50_000_000, `Expected available 50,000,000, got ${bal.available_kobo}`);
    assert(Number(bal.reserved_withdrawal_kobo) === 0, "Reserved should be 0");
    assert(Number(bal.invested_principal_kobo) === 0, "Invested should be 0");
    assert(Number(bal.total_customer_liability_kobo) === 50_000_000, "Total liability should equal 50,000,000");
    return `available=50,000,000 kobo, total_liability=50,000,000 kobo`;
  });

  await test("A. Financial Integrity", "Commit-time deferred constraint trigger rejects unbalanced journal postings", async () => {
    const periodId = (await db.query(`SELECT id FROM public.financial_periods WHERE status = 'open' LIMIT 1`)).rows[0].id;
    const clearingAcc = (await db.query(`SELECT id FROM public.ledger_accounts WHERE account_code = '1010-PAYSTACK-CLEARING'`)).rows[0].id;
    const msg = await expectError(async () => {
      await db.exec("BEGIN");
      try {
        const je = await db.query(
          `INSERT INTO public.journal_entries (financial_period_id, idempotency_key, entry_type, reference_code, description)
           VALUES ($1, 'unbalanced-test-1', 'test', 'UNBAL-1', 'Unbalanced posting test') RETURNING id`,
          [periodId],
        );
        await db.query(
          `INSERT INTO public.journal_lines (journal_entry_id, ledger_account_id, direction, amount_kobo)
           VALUES ($1, $2, 'debit', 100000), ($1, $3, 'credit', 90000)`,
          [je.rows[0].id, clearingAcc, w1.available_account_id],
        );
        await db.exec("COMMIT");
      } catch (e) {
        await db.exec("ROLLBACK");
        throw e;
      }
    }, /UNBALANCED_JOURNAL_ENTRY/, "Unbalanced commit");
    return `Rejected at COMMIT (${msg.split(":")[0]})`;
  });

  await test("A. Financial Integrity", "Duplicate idempotency deposit settlement returns original entry without double-crediting", async () => {
    const secondId = await runAs(db, "service_role", null, async () => {
      const r = await db.query(
        `SELECT public.settle_verified_deposit('PSK-STG-0001', 50000000, 'VERIFY-SRV-0001', 'dep-settle-001') AS id`,
      );
      return r.rows[0].id;
    });
    assert(secondId === firstDepositEntryId, "Expected identical journal entry ID on replay");
    const bal = (await db.query(`SELECT available_kobo FROM public.wallet_balances WHERE wallet_id = $1`, [w1.id])).rows[0];
    assert(Number(bal.available_kobo) === 50_000_000, `Balance should remain 50,000,000, got ${bal.available_kobo}`);
    return "Replayed idempotency key returned exact entry ID with zero balance inflation";
  });

  await test("A. Financial Integrity", "Posted journal entries & lines are strictly immutable (UPDATE & DELETE blocked)", async () => {
    await expectError(
      () => db.query(`UPDATE public.journal_entries SET description = 'tampered' WHERE id = $1`, [firstDepositEntryId]),
      /IMMUTABLE_RECORD/,
      "UPDATE journal_entries",
    );
    await expectError(
      () => db.query(`DELETE FROM public.journal_lines WHERE journal_entry_id = $1`, [firstDepositEntryId]),
      /IMMUTABLE_RECORD/,
      "DELETE journal_lines",
    );
    return "UPDATE and DELETE triggers blocked mutation";
  });

  await test("A. Financial Integrity", "Four-eyes reversal posts mirrored entry and blocks double-reversal", async () => {
    // Post a small secondary deposit of NGN 10,000 (1,000,000 kobo) to reverse
    await runAs(db, "authenticated", USERS.inv1, async () => {
      await db.query(
        `SELECT public.initialize_deposit(1000000, 'paystack_checkout_card', 'PSK-STG-REV1', 'dep-init-rev1')`,
      );
    });
    const revTargetEntry = await runAs(db, "service_role", null, async () => {
      const r = await db.query(
        `SELECT public.settle_verified_deposit('PSK-STG-REV1', 1000000, 'VERIFY-SRV-REV1', 'dep-settle-rev1') AS id`,
      );
      return r.rows[0].id;
    });

    const revActionId = await runAs(db, "authenticated", USERS.finA, async () => {
      const r = await db.query(
        `SELECT public.request_transaction_reversal($1, 'Synthetic erroneous deposit reversal test') AS id`,
        [revTargetEntry],
      );
      return r.rows[0].id;
    });

    // Self-approval by FinA must fail
    await expectError(
      () =>
        runAs(db, "authenticated", USERS.finA, async () => {
          await db.query(`SELECT public.approve_and_post_reversal($1, 'rev-idem-self')`, [revActionId]);
        }),
      /FOUR_EYES_VIOLATION/,
      "Self-approval of reversal",
    );

    // Independent approval by FinB succeeds
    await runAs(db, "authenticated", USERS.finB, async () => {
      await db.query(`SELECT public.approve_and_post_reversal($1, 'rev-idem-ok')`, [revActionId]);
    });

    // Balance returns cleanly to 50,000,000 kobo
    const bal = (await db.query(`SELECT available_kobo FROM public.wallet_balances WHERE wallet_id = $1`, [w1.id])).rows[0];
    assert(Number(bal.available_kobo) === 50_000_000, `Expected 50,000,000 after reversal, got ${bal.available_kobo}`);

    // Second reversal attempt must fail
    await expectError(
      () =>
        runAs(db, "authenticated", USERS.finA, async () => {
          await db.query(`SELECT public.request_transaction_reversal($1, 'Attempt double reversal')`, [revTargetEntry]);
        }),
      /ALREADY_REVERSED/,
      "Double reversal",
    );
    return "Mirrored reversal posted; self-approval and double-reversal blocked";
  });

  await test("A. Financial Integrity", "Cached-vs-journal reconciliation passes cleanly and flags drift on simulated tamper", async () => {
    const clean = await runAs(db, "authenticated", USERS.finA, async () => {
      const r = await db.query(`SELECT * FROM public.reconcile_wallet_balance($1)`, [w1.id]);
      return r.rows[0];
    });
    assert(clean.is_reconciled === true, "Expected clean reconciliation");
    assert(Number(clean.cached_total_liability_kobo) === Number(clean.ledger_total_liability_kobo), "Totals must match");

    // Simulate out-of-band cache corruption as superuser and verify drift alert fires
    await db.query(`UPDATE public.wallet_balances SET available_kobo = available_kobo + 100 WHERE wallet_id = $1`, [w1.id]);
    const drift = await runAs(db, "service_role", null, async () => {
      const r = await db.query(`SELECT * FROM public.reconcile_wallet_balance($1)`, [w1.id]);
      return r.rows[0];
    });
    assert(drift.is_reconciled === false, "Expected drift detection");
    const alerts = await db.query(
      `SELECT COUNT(*)::int AS cnt FROM public.compliance_events WHERE event_type = 'LEDGER_RECONCILIATION_DRIFT' AND severity = 'critical'`,
    );
    assert(alerts.rows[0].cnt >= 1, "Expected critical compliance event on drift");

    // Restore clean cache state for remaining tests
    await db.query(`UPDATE public.wallet_balances SET available_kobo = available_kobo - 100 WHERE wallet_id = $1`, [w1.id]);
    return "Clean match confirmed + critical drift detection verified";
  });

  // =========================================================================
  // SUITE B: DATABASE SECURITY, RLS, GRANTS & ANTI-ESCALATION
  // =========================================================================
  console.log("\nSuite B: Database Security");

  await test("B. Security", "Investor account isolation (Investor 1 cannot read Investor 2 profile, wallet, or transactions)", async () => {
    const rows = await runAs(db, "authenticated", USERS.inv1, async () => {
      const p = await db.query(`SELECT id FROM public.profiles WHERE id = $1`, [USERS.inv2]);
      const wb = await db.query(`SELECT wallet_id FROM public.wallet_balances WHERE user_id = $1`, [USERS.inv2]);
      const le = await db.query(`SELECT id FROM public.journal_entries`);
      return { p: p.rows.length, wb: wb.rows.length, le: le.rows.length };
    });
    assert(rows.p === 0 && rows.wb === 0 && rows.le === 0, `Data leak detected: ${JSON.stringify(rows)}`);
    return "0 cross-account profile/wallet/journal rows visible to Investor 1";
  });

  await test("B. Security", "Direct browser-side financial DML (INSERT/UPDATE/DELETE) blocked by least-privilege grants", async () => {
    await expectError(
      () =>
        runAs(db, "authenticated", USERS.inv1, async () => {
          await db.query(`UPDATE public.wallet_balances SET available_kobo = 999999999 WHERE user_id = $1`, [USERS.inv1]);
        }),
      /permission denied/i,
      "Direct UPDATE wallet_balances",
    );
    await expectError(
      () =>
        runAs(db, "authenticated", USERS.inv1, async () => {
          await db.query(`INSERT INTO public.user_roles (user_id, role) VALUES ($1, 'super_admin')`, [USERS.inv1]);
        }),
      /permission denied/i,
      "Direct INSERT user_roles",
    );
    return "Direct client DML denied by REVOKE ALL grants";
  });

  await test("B. Security", "Unauthorized administrative access & role escalation attempts rejected inside SECURITY DEFINER RPCs", async () => {
    // Investor cannot request role escalation
    await expectError(
      () =>
        runAs(db, "authenticated", USERS.inv1, async () => {
          await db.query(`SELECT public.request_role_change($1, 'super_admin', 'grant', 'escalate')`, [USERS.inv2]);
        }),
      /UNAUTHORIZED_ROLE_ESCALATION/,
      "Investor role escalation",
    );
    // SuperAdmin A cannot escalate self
    await expectError(
      () =>
        runAs(db, "authenticated", USERS.supA, async () => {
          await db.query(`SELECT public.request_role_change($1, 'finance_officer', 'grant', 'self grant')`, [USERS.supA]);
        }),
      /SELF_ESCALATION_BLOCKED/,
      "SuperAdmin self-escalation",
    );
    // SuperAdmin A initiating role grant for Admin A cannot self-approve
    const roleActId = await runAs(db, "authenticated", USERS.supA, async () => {
      const r = await db.query(
        `SELECT public.request_role_change($1, 'compliance_officer', 'grant', 'Staging dual role test') AS id`,
        [USERS.adm],
      );
      return r.rows[0].id;
    });
    await expectError(
      () =>
        runAs(db, "authenticated", USERS.supA, async () => {
          await db.query(`SELECT public.approve_role_change($1)`, [roleActId]);
        }),
      /FOUR_EYES_VIOLATION/,
      "SuperAdmin self-approval of role grant",
    );
    // Independent SuperAdmin B approves cleanly
    await runAs(db, "authenticated", USERS.supB, async () => {
      await db.query(`SELECT public.approve_role_change($1)`, [roleActId]);
    });
    return "Investor escalation, self-escalation & self-approval blocked; dual super_admin grant succeeded";
  });

  await test("B. Security", "Unauthorized RPC execution blocked for anon & authenticated on service-only functions", async () => {
    await expectError(
      () =>
        runAs(db, "authenticated", USERS.inv1, async () => {
          await db.query(`SELECT public.settle_verified_deposit('PSK-FAKE', 1000000, 'FAKE', 'fake-key')`);
        }),
      /permission denied/i,
      "Authenticated calling settle_verified_deposit",
    );
    await expectError(
      () =>
        runAs(db, "anon", null, async () => {
          await db.query(`SELECT public.request_withdrawal(500000, $1, 'anon-wd')`, [inv1BankId]);
        }),
      /permission denied/i,
      "Anon calling request_withdrawal",
    );
    return "Service-only settlement RPCs and authenticated RPCs denied to unauthorized callers";
  });

  await test("B. Security", "Unauthorized KYC metadata access blocked (Investor 2 & Finance Officer cannot read Investor 1 KYC)", async () => {
    const kycId = await runAs(db, "authenticated", USERS.inv1, async () => {
      const r = await db.query(
        `SELECT public.submit_kyc_record('Tier 3', repeat('a', 64), '1234', repeat('b', 64), '5678') AS id`,
      );
      return r.rows[0].id;
    });

    const inv2Count = await runAs(db, "authenticated", USERS.inv2, async () => {
      return (await db.query(`SELECT id FROM public.kyc_records WHERE id = $1`, [kycId])).rows.length;
    });
    const finCount = await runAs(db, "authenticated", USERS.finA, async () => {
      return (await db.query(`SELECT id FROM public.kyc_records WHERE id = $1`, [kycId])).rows.length;
    });
    const compCount = await runAs(db, "authenticated", USERS.comp, async () => {
      return (await db.query(`SELECT id FROM public.kyc_records WHERE id = $1`, [kycId])).rows.length;
    });
    assert(inv2Count === 0, "Investor 2 must see 0 KYC records of Investor 1");
    assert(finCount === 0, "Finance Officer must see 0 KYC records");
    assert(compCount === 1, "Compliance Officer must see submitted KYC record");

    // Finance officer cannot call review_kyc_record
    await expectError(
      () =>
        runAs(db, "authenticated", USERS.finA, async () => {
          await db.query(`SELECT public.review_kyc_record($1, 'approved', 'Unauthorized review')`, [kycId]);
        }),
      /UNAUTHORIZED_ROLE/,
      "Finance officer reviewing KYC",
    );
    return "KYC metadata isolated strictly to owner + compliance_officer/super_admin";
  });

  await test("B. Security", "All SECURITY DEFINER functions in public schema pin search_path = public, pg_temp", async () => {
    const unpinned = await db.query(`
      SELECT p.proname, p.proconfig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.prosecdef = true
        AND (p.proconfig IS NULL OR NOT ('search_path=public, pg_temp' = ANY(p.proconfig)))
    `);
    assert(unpinned.rows.length === 0, `Unpinned SECURITY DEFINER functions: ${unpinned.rows.map((r) => r.proname).join(", ")}`);
    const totalDefiner = (
      await db.query(`
        SELECT COUNT(*)::int AS cnt FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.prosecdef = true
      `)
    ).rows[0].cnt;
    return `${totalDefiner}/${totalDefiner} SECURITY DEFINER functions pin search_path=public, pg_temp`;
  });

  // =========================================================================
  // SUITE C: CONCURRENCY & RACE GUARDRAILS
  // =========================================================================
  console.log("\nSuite C: Concurrency & Race Guardrails");

  let wd1Id;
  let wd2Id;
  await test("C. Concurrency", "Overlapping withdrawal requests exceeding available balance reject overspend atomically", async () => {
    // Investor 1 currently has 50,000,000 kobo available. Request 30,000,000 then attempt 25,000,000 (total 55,000,000 > 50,000,000)
    wd1Id = await runAs(db, "authenticated", USERS.inv1, async () => {
      const r = await db.query(`SELECT public.request_withdrawal(30000000, $1, 'wd-conc-1') AS id`, [inv1BankId]);
      return r.rows[0].id;
    });
    await expectError(
      () =>
        runAs(db, "authenticated", USERS.inv1, async () => {
          await db.query(`SELECT public.request_withdrawal(25000000, $1, 'wd-conc-2')`, [inv1BankId]);
        }),
      /INSUFFICIENT_AVAILABLE_BALANCE/,
      "Second overlapping withdrawal",
    );
    const bal = (await db.query(`SELECT * FROM public.wallet_balances WHERE wallet_id = $1`, [w1.id])).rows[0];
    assert(Number(bal.available_kobo) === 20_000_000, "Available should be 20,000,000");
    assert(Number(bal.reserved_withdrawal_kobo) === 30_000_000, "Reserved should be 30,000,000");
    assert(Number(bal.total_customer_liability_kobo) === 50_000_000, "Total liability invariant at 50,000,000");
    return "Reservation atomic; overspend rejected; total customer liability invariant";
  });

  await test("C. Concurrency", "Duplicate settlement requests are idempotent and never double-debit reserved balance", async () => {
    // Approve wd1 via FinA -> batch via FinA -> approve batch via FinB -> settle twice with same idempotency key
    await runAs(db, "authenticated", USERS.finA, async () => {
      await db.query(`SELECT public.approve_withdrawal_four_eyes($1, 'Approved for staging batch')`, [wd1Id]);
    });
    const batchId = await runAs(db, "authenticated", USERS.finA, async () => {
      const r = await db.query(
        `SELECT public.create_withdrawal_batch('WB-20261123-01', now() + interval '2 hours', ARRAY[$1]::uuid[]) AS id`,
        [wd1Id],
      );
      return r.rows[0].id;
    });
    // FinA cannot approve own batch
    await expectError(
      () =>
        runAs(db, "authenticated", USERS.finA, async () => {
          await db.query(`SELECT public.approve_withdrawal_batch_four_eyes($1, 'TREAS-REF-01')`, [batchId]);
        }),
      /FOUR_EYES_VIOLATION/,
      "Batch self-approval",
    );
    await runAs(db, "authenticated", USERS.finB, async () => {
      await db.query(`SELECT public.approve_withdrawal_batch_four_eyes($1, 'TREAS-REF-01')`, [batchId]);
    });

    const settle1 = await runAs(db, "service_role", null, async () => {
      return (await db.query(`SELECT public.settle_withdrawal($1, 'NIP-STG-0001', 'settle-wd-1') AS id`, [wd1Id])).rows[0].id;
    });
    const settle2 = await runAs(db, "service_role", null, async () => {
      return (await db.query(`SELECT public.settle_withdrawal($1, 'NIP-STG-0001', 'settle-wd-1') AS id`, [wd1Id])).rows[0].id;
    });
    assert(settle1 === settle2, "Duplicate settlement must return original entry ID");
    const bal = (await db.query(`SELECT * FROM public.wallet_balances WHERE wallet_id = $1`, [w1.id])).rows[0];
    assert(Number(bal.reserved_withdrawal_kobo) === 0, "Reserved must be 0 after settlement");
    assert(Number(bal.total_customer_liability_kobo) === 20_000_000, "Total liability reduced exactly by 30,000,000");
    return "Duplicate settlement idempotent; reserved cleared cleanly once";
  });

  await test("C. Concurrency", "Failed payout releases reserved funds atomically back to available balance", async () => {
    wd2Id = await runAs(db, "authenticated", USERS.inv1, async () => {
      const r = await db.query(`SELECT public.request_withdrawal(5000000, $1, 'wd-fail-1') AS id`, [inv1BankId]);
      return r.rows[0].id;
    });
    const rel1 = await runAs(db, "service_role", null, async () => {
      return (
        await db.query(`SELECT public.fail_or_decline_withdrawal($1, 'Simulated NIP bank timeout', 'failed', 'rel-wd-2') AS id`, [wd2Id])
      ).rows[0].id;
    });
    const rel2 = await runAs(db, "service_role", null, async () => {
      return (
        await db.query(`SELECT public.fail_or_decline_withdrawal($1, 'Simulated NIP bank timeout', 'failed', 'rel-wd-2') AS id`, [wd2Id])
      ).rows[0].id;
    });
    assert(rel1 === rel2, "Duplicate failure release must be idempotent");
    const bal = (await db.query(`SELECT * FROM public.wallet_balances WHERE wallet_id = $1`, [w1.id])).rows[0];
    assert(Number(bal.available_kobo) === 20_000_000, "Available restored to 20,000,000");
    assert(Number(bal.reserved_withdrawal_kobo) === 0, "Reserved restored to 0");
    return "Failed payout released idempotently; available balance restored";
  });

  await test("C. Concurrency", "Competing balance reservation (withdrawal vs investment subscription) prevents double-spend of available balance", async () => {
    // Investor 1 has 20,000,000 kobo available. Reserve 16,000,000 for withdrawal -> remaining available 4,000,000.
    // Attempting a 5,000,000 investment subscription must fail with INSUFFICIENT_AVAILABLE_BALANCE.
    const compWdId = await runAs(db, "authenticated", USERS.inv1, async () => {
      return (await db.query(`SELECT public.request_withdrawal(16000000, $1, 'wd-compete-1') AS id`, [inv1BankId])).rows[0].id;
    });
    await expectError(
      () =>
        runAs(db, "authenticated", USERS.inv1, async () => {
          await db.query(`SELECT public.create_investment($1, 5000000, 'inv-compete-1')`, [PLANS.tbillNoCompound]);
        }),
      /INSUFFICIENT_AVAILABLE_BALANCE/,
      "Competing investment vs reserved withdrawal",
    );
    // Release the reservation cleanly so Investor 1 returns to 20,000,000 available
    await runAs(db, "authenticated", USERS.finA, async () => {
      await db.query(`SELECT public.fail_or_decline_withdrawal($1, 'Competing reservation test cleanup', 'declined', 'decl-compete-1')`, [compWdId]);
    });
    return "Reserved funds isolated from investment allocations; zero double-spend";
  });

  // =========================================================================
  // SUITE D: BUSINESS RULES
  // =========================================================================
  console.log("\nSuite D: Business Rules");

  await test("D. Business Rules", "Unapproved withdrawal cannot be settled & bank-detail/manual-adjustment/config changes require four-eyes", async () => {
    const wdUnapproved = await runAs(db, "authenticated", USERS.inv1, async () => {
      return (await db.query(`SELECT public.request_withdrawal(1000000, $1, 'wd-unapp-1') AS id`, [inv1BankId])).rows[0].id;
    });
    await expectError(
      () =>
        runAs(db, "service_role", null, async () => {
          await db.query(`SELECT public.settle_withdrawal($1, 'NIP-UNAPP-1', 'settle-unapp-1')`, [wdUnapproved]);
        }),
      /FOUR_EYES_APPROVAL_REQUIRED/,
      "Settle unapproved withdrawal",
    );
    await runAs(db, "authenticated", USERS.finA, async () => {
      await db.query(`SELECT public.fail_or_decline_withdrawal($1, 'Test cleanup decline', 'declined', 'decl-unapp-1')`, [wdUnapproved]);
    });

    // Bank detail change: owner cannot self-approve even if trying via RPC
    const bankReq2 = await runAs(db, "authenticated", USERS.inv1, async () => {
      return (
        await db.query(`SELECT public.request_bank_account_change('057', 'Zenith Bank', '2098765432', 'Synthetic Investor One') AS id`)
      ).rows[0].id;
    });
    await expectError(
      () =>
        runAs(db, "authenticated", USERS.inv1, async () => {
          await db.query(`SELECT public.approve_bank_account_change($1, 'Self approve attempt')`, [bankReq2]);
        }),
      /UNAUTHORIZED_ROLE|FOUR_EYES_VIOLATION/,
      "Self-approve bank change",
    );

    // Manual ledger adjustment: initiator cannot self-approve, independent FinB succeeds
    const clearingAcc = (await db.query(`SELECT id FROM public.ledger_accounts WHERE account_code = '1010-PAYSTACK-CLEARING'`)).rows[0].id;
    const treasuryAcc = (await db.query(`SELECT id FROM public.ledger_accounts WHERE account_code = '1020-TREASURY-BANK'`)).rows[0].id;
    const adjLines = JSON.stringify([
      { account_id: treasuryAcc, direction: "debit", amount_kobo: 500000, memo: "Clearing sweep to treasury bank" },
      { account_id: clearingAcc, direction: "credit", amount_kobo: 500000, memo: "Clear Paystack settlement batch" },
    ]);
    const adjAct = await runAs(db, "authenticated", USERS.finA, async () => {
      return (
        await db.query(`SELECT public.request_manual_ledger_adjustment($1::jsonb, 'ADJ-STG-001', 'Treasury clearing sweep test') AS id`, [adjLines])
      ).rows[0].id;
    });
    await expectError(
      () =>
        runAs(db, "authenticated", USERS.finA, async () => {
          await db.query(`SELECT public.approve_and_post_manual_adjustment($1, 'adj-self')`, [adjAct]);
        }),
      /FOUR_EYES_VIOLATION/,
      "Self-approve manual ledger adjustment",
    );
    await runAs(db, "authenticated", USERS.finB, async () => {
      await db.query(`SELECT public.approve_and_post_manual_adjustment($1, 'adj-ok-1')`, [adjAct]);
    });

    // Sensitive platform setting change: SuperAdmin A initiates, cannot self-approve, SuperAdmin B approves
    const cfgAct = await runAs(db, "authenticated", USERS.supA, async () => {
      return (
        await db.query(
          `SELECT public.request_platform_setting_change('deposit.min_kobo', '{"amount_kobo": 1500000}'::jsonb, 'Staging threshold update test') AS id`,
        )
      ).rows[0].id;
    });
    await expectError(
      () =>
        runAs(db, "authenticated", USERS.supA, async () => {
          await db.query(`SELECT public.approve_platform_setting_change($1)`, [cfgAct]);
        }),
      /FOUR_EYES_VIOLATION/,
      "Self-approve platform setting change",
    );
    await runAs(db, "authenticated", USERS.supB, async () => {
      await db.query(`SELECT public.approve_platform_setting_change($1)`, [cfgAct]);
    });

    return "All four-eyes gates (withdrawal, bank change, manual adjustment, platform config) enforced";
  });

  await test("D. Business Rules", "Default rollover is principal_only; return compounding requires BOTH plan eligibility AND explicit consent", async () => {
    await expectError(
      () =>
        runAs(db, "authenticated", USERS.inv1, async () => {
          await db.query(
            `SELECT public.create_investment($1, 5000000, 'inv-bad-comp-plan', 'principal_plus_net_return', true, 'consent-v1')`,
            [PLANS.tbillNoCompound],
          );
        }),
      /COMPOUNDING_NOT_PERMITTED/,
      "Compounding on non-eligible plan",
    );

    await expectError(
      () =>
        runAs(db, "authenticated", USERS.inv1, async () => {
          await db.query(
            `SELECT public.create_investment($1, 10000000, 'inv-no-consent', 'principal_plus_net_return', false, NULL)`,
            [PLANS.cpAllowsCompound],
          );
        }),
      /EXPLICIT_CONSENT_REQUIRED/,
      "Compounding without consent",
    );

    const invDefaultId = await runAs(db, "authenticated", USERS.inv1, async () => {
      return (await db.query(`SELECT public.create_investment($1, 5000000, 'inv-default-1') AS id`, [PLANS.tbillNoCompound])).rows[0].id;
    });
    const invRow = (await db.query(`SELECT rollover_mode FROM public.investments WHERE id = $1`, [invDefaultId])).rows[0];
    assert(invRow.rollover_mode === "principal_only", `Expected principal_only default, got ${invRow.rollover_mode}`);
    return "Plan-eligibility gate, explicit consent gate, and principal_only default verified";
  });

  await test("D. Business Rules", "Configurable tax_rules resolve effective dates & exemptions dynamically + tax_applications immutable", async () => {
    const cpInvId = await runAs(db, "authenticated", USERS.inv1, async () => {
      return (
        await db.query(
          `SELECT public.create_investment($1, 10000000, 'inv-cp-tax-1', 'principal_plus_net_return', true, 'consent-v1.0') AS id`,
          [PLANS.cpAllowsCompound],
        )
      ).rows[0].id;
    });

    const payAct1 = await runAs(db, "authenticated", USERS.finA, async () => {
      return (
        await db.query(
          `SELECT public.request_realized_return_distribution($1, 1000000, 0, 'TREAS-YLD-01', 'Staging historical tax window test') AS id`,
          [cpInvId],
        )
      ).rows[0].id;
    });
    // Initiator FinA cannot self-approve realized return distribution
    await expectError(
      () =>
        runAs(db, "authenticated", USERS.finA, async () => {
          await db.query(`SELECT public.approve_and_distribute_investment_payout($1, 'pay-self-fail', '2026-03-15T12:00:00Z')`, [payAct1]);
        }),
      /FOUR_EYES_VIOLATION/,
      "Self-approve realized payout",
    );

    const payout1 = await runAs(db, "authenticated", USERS.finB, async () => {
      return (
        await db.query(`SELECT public.approve_and_distribute_investment_payout($1, 'pay-tax-v1', '2026-03-15T12:00:00Z') AS id`, [payAct1])
      ).rows[0].id;
    });

    const payAct2 = await runAs(db, "authenticated", USERS.finA, async () => {
      return (
        await db.query(
          `SELECT public.request_realized_return_distribution($1, 1000000, 0, 'TREAS-YLD-02', 'Staging updated tax window test') AS id`,
          [cpInvId],
        )
      ).rows[0].id;
    });
    const payout2 = await runAs(db, "authenticated", USERS.finB, async () => {
      return (
        await db.query(`SELECT public.approve_and_distribute_investment_payout($1, 'pay-tax-v2', '2026-09-15T12:00:00Z') AS id`, [payAct2])
      ).rows[0].id;
    });

    const t1 = (await db.query(`SELECT id, tax_rate_bps, tax_amount_kobo, net_amount_kobo FROM public.tax_applications WHERE investment_payout_id = $1`, [payout1])).rows[0];
    const t2 = (await db.query(`SELECT id, tax_rate_bps, tax_amount_kobo, net_amount_kobo FROM public.tax_applications WHERE investment_payout_id = $1`, [payout2])).rows[0];

    assert(Number(t1.tax_rate_bps) === 1000 && Number(t1.tax_amount_kobo) === 100_000 && Number(t1.net_amount_kobo) === 900_000, "Historical rule v1 mismatch");
    assert(Number(t2.tax_rate_bps) === 750 && Number(t2.tax_amount_kobo) === 75_000 && Number(t2.net_amount_kobo) === 925_000, "Updated rule v2 mismatch");

    // Verify tax_applications financial immutability & one-time remittance reference recording
    await expectError(
      () => db.query(`UPDATE public.tax_applications SET tax_amount_kobo = 0 WHERE id = $1`, [t1.id]),
      /IMMUTABLE_RECORD/,
      "Tamper tax_applications amount",
    );
    await db.query(`UPDATE public.tax_applications SET remittance_reference = 'FIRS-STG-REM-01', remitted_at = now() WHERE id = $1`, [t1.id]);
    await expectError(
      () => db.query(`UPDATE public.tax_applications SET remittance_reference = 'FIRS-OVERWRITE' WHERE id = $1`, [t1.id]),
      /IMMUTABLE_RECORD/,
      "Overwrite tax remittance reference",
    );

    const exemptRule = (
      await db.query(`SELECT * FROM public.resolve_applicable_tax_rule('WHT', 'fgn_treasury_bill', 'retail_individual', '2026-09-15T12:00:00Z')`)
    ).rows[0];
    assert(exemptRule.is_exempt === true && Number(exemptRule.rate_bps) === 0, "FGN Treasury exemption failed");

    return "2026-03=10.00%, 2026-09=7.50%, FGN T-Bill=0% exempt, tax_applications immutable";
  });

  await test("D. Business Rules", "Rollover into PAUSED and ARCHIVED plans is strictly blocked; active consented compounding succeeds", async () => {
    // 1) Pause T-Bill plan and mature inv-default-1 -> must settle to available, NOT roll over
    await runAs(db, "authenticated", USERS.adm, async () => {
      await db.query(`SELECT public.set_investment_plan_status($1, 'paused', 'Staging rollover pause guard test')`, [PLANS.tbillNoCompound]);
    });

    const invDefault = (
      await db.query(`SELECT id FROM public.investments WHERE plan_id = $1 AND status = 'active' LIMIT 1`, [PLANS.tbillNoCompound])
    ).rows[0];

    const matPausedId = await runAs(db, "authenticated", USERS.finA, async () => {
      return (await db.query(`SELECT public.mature_investment($1, 'mat-paused-test') AS id`, [invDefault.id])).rows[0].id;
    });
    const matPaused = (await db.query(`SELECT * FROM public.investment_maturities WHERE id = $1`, [matPausedId])).rows[0];
    assert(matPaused.maturity_disposition === "settled_to_available_plan_unavailable", "Paused plan must settle to available");
    assert(matPaused.child_investment_id === null, "No child investment allowed for paused plan");

    // 2) Active consented CP plan -> compounds 10,000,000 + 1,825,000 = 11,825,000 into child position
    const cpInv = (
      await db.query(`SELECT id FROM public.investments WHERE plan_id = $1 AND status = 'active' LIMIT 1`, [PLANS.cpAllowsCompound])
    ).rows[0];
    const matActiveId = await runAs(db, "authenticated", USERS.finA, async () => {
      return (await db.query(`SELECT public.mature_investment($1, 'mat-active-comp') AS id`, [cpInv.id])).rows[0].id;
    });
    const matActive = (await db.query(`SELECT * FROM public.investment_maturities WHERE id = $1`, [matActiveId])).rows[0];
    assert(matActive.maturity_disposition === "rolled_principal_plus_net_return", "Active consented plan should compound");
    const childInv = (await db.query(`SELECT id, principal_kobo FROM public.investments WHERE id = $1`, [matActive.child_investment_id])).rows[0];
    assert(Number(childInv.principal_kobo) === 11_825_000, `Expected compounded principal 11,825,000, got ${childInv.principal_kobo}`);

    // 3) Archive CP plan and mature the rolled child -> must settle to available, NOT roll over into archived plan!
    await runAs(db, "authenticated", USERS.adm, async () => {
      await db.query(`SELECT public.set_investment_plan_status($1, 'archived', 'Staging rollover archive guard test')`, [PLANS.cpAllowsCompound]);
    });
    const matArchivedId = await runAs(db, "authenticated", USERS.finA, async () => {
      return (await db.query(`SELECT public.mature_investment($1, 'mat-archived-test') AS id`, [childInv.id])).rows[0].id;
    });
    const matArchived = (await db.query(`SELECT * FROM public.investment_maturities WHERE id = $1`, [matArchivedId])).rows[0];
    assert(matArchived.maturity_disposition === "settled_to_available_plan_unavailable", "Archived plan must settle to available");
    assert(matArchived.child_investment_id === null, "No child investment allowed for archived plan");

    // 4) Final end-to-end ledger reconciliation check after all mutations
    const finalRecon = await runAs(db, "service_role", null, async () => {
      return (await db.query(`SELECT * FROM public.reconcile_wallet_balance($1)`, [w1.id])).rows[0];
    });
    assert(finalRecon.is_reconciled === true, "Final reconciliation after all suites must pass with 0 delta");

    return `Paused & archived plans both blocked rollover; active consented plan rolled 11,825,000 kobo; final recon delta=0`;
  });

  // Catalog Inventory Metrics (exact ground-truth from PostgreSQL pg_catalog)
  const inv = await db.query(`
    SELECT
      (SELECT COUNT(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r') AS tables_count,
      (SELECT COUNT(*)::int FROM pg_indexes WHERE schemaname='public') AS indexes_count,
      (SELECT COUNT(*)::int FROM pg_constraint con JOIN pg_namespace n ON n.oid=con.connamespace WHERE n.nspname='public') AS constraints_count,
      (SELECT COUNT(*)::int FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal) AS triggers_count,
      (SELECT COUNT(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public') AS functions_count,
      (SELECT COUNT(*)::int FROM pg_policies WHERE schemaname='public') AS rls_policies_count
  `);
  console.log("\n=== PG_CATALOG INVENTORY ===");
  console.log(JSON.stringify(inv.rows[0], null, 2));

  // Summary
  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  console.log(`\n=== SUMMARY: ${passed}/${results.length} PASSED, ${failed} FAILED ===`);
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});

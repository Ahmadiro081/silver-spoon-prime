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

  // =========================================================================
  // SUITE E: PHASE B.5 SECURITY & PUBLIC PLAN VISIBILITY HARDENING
  // =========================================================================
  console.log("\nSuite E: Phase B.5 Hardening (Migration 0013)");

  await test("E. Phase B.5 Hardening", "SECURITY DEFINER caller checks block investors from reconcile_wallet_balance & fail_or_decline_withdrawal", async () => {
    await expectError(
      () =>
        runAs(db, "authenticated", USERS.inv1, async () => {
          await db.query(`SELECT * FROM public.reconcile_wallet_balance($1)`, [w1.id]);
        }),
      /UNAUTHORIZED_RECONCILIATION/,
      "Investor calling reconcile_wallet_balance",
    );

    const wdTestId = await runAs(db, "authenticated", USERS.inv1, async () => {
      return (await db.query(`SELECT public.request_withdrawal(1000000, $1, 'wd-b5-sec-1') AS id`, [inv1BankId])).rows[0].id;
    });

    // Investor cannot decline or fail their own withdrawal via staff/service RPC
    await expectError(
      () =>
        runAs(db, "authenticated", USERS.inv1, async () => {
          await db.query(`SELECT public.fail_or_decline_withdrawal($1, 'Investor self-release attempt', 'declined', 'inv-self-decl')`, [wdTestId]);
        }),
      /UNAUTHORIZED/,
      "Investor calling fail_or_decline_withdrawal(declined)",
    );

    // Finance officer cannot trigger 'failed' payout release without verified backend service_role callback
    await expectError(
      () =>
        runAs(db, "authenticated", USERS.finA, async () => {
          await db.query(`SELECT public.fail_or_decline_withdrawal($1, 'Unverified manual fail attempt', 'failed', 'fin-unver-fail')`, [wdTestId]);
        }),
      /VERIFIED_FAILURE_SERVICE_REQUIRED/,
      "Finance officer calling fail_or_decline_withdrawal(failed)",
    );

    // Competing administrative approvals: FinA approves -> FinB competing approval MUST fail
    await runAs(db, "authenticated", USERS.finA, async () => {
      await db.query(`SELECT public.approve_withdrawal_four_eyes($1, 'FinA primary approval')`, [wdTestId]);
    });
    await expectError(
      () =>
        runAs(db, "authenticated", USERS.finB, async () => {
          await db.query(`SELECT public.approve_withdrawal_four_eyes($1, 'FinB competing approval')`, [wdTestId]);
        }),
      /INVALID_WITHDRAWAL_STATE/,
      "Competing administrative approval",
    );

    // Cleanly release via verified service_role failure callback
    await runAs(db, "service_role", null, async () => {
      await db.query(`SELECT public.fail_or_decline_withdrawal($1, 'Verified bank NIP failure callback', 'failed', 'srv-ver-fail-b5')`, [wdTestId]);
    });

    return "Investor bypass blocked; failed release restricted to verified service_role; competing admin approval rejected";
  });

  await test("E. Phase B.5 Hardening", "Anti-role-enumeration & public schema CREATE revocation + internal helper restriction", async () => {
    const probed = await runAs(db, "authenticated", USERS.inv1, async () => {
      const r = await db.query(`SELECT public.app_has_role($1, 'super_admin') AS is_sup`, [USERS.supA]);
      return r.rows[0].is_sup;
    });
    assert(probed === false, "Investor must not be able to enumerate another user's super_admin role");

    await expectError(
      () =>
        runAs(db, "authenticated", USERS.inv1, async () => {
          await db.query(`SELECT public.internal_is_service_caller()`);
        }),
      /permission denied/i,
      "Authenticated calling internal_is_service_caller",
    );

    const privs = (
      await db.query(`
        SELECT
          has_schema_privilege('anon', 'public', 'CREATE') AS anon_create,
          has_schema_privilege('authenticated', 'public', 'CREATE') AS auth_create
      `)
    ).rows[0];
    assert(privs.anon_create === false && privs.auth_create === false, `Unexpected schema CREATE privs: ${JSON.stringify(privs)}`);

    return "Cross-user role enumeration returns false; anon/authenticated have 0 CREATE privileges on public";
  });

  await test("E. Phase B.5 Hardening", "Public anonymous users see ONLY status = 'active' investment plans (paused & archived hidden)", async () => {
    // Currently T-Bill is 'paused' and CP is 'archived' from Suite D; insert a fresh 'active' plan to verify contrast
    await db.query(`
      INSERT INTO public.investment_plans (
        plan_code, slug, name, instrument_type, risk_band, tenor_days,
        min_amount_kobo, illustrative_target_return_bps, allows_return_compounding, status, summary
      ) VALUES (
        'PLN-ACT-30', 'active-liquidity-30', 'Active Liquidity 30D (Staging)', 'money_market_fund',
        'Conservative', 30, 5000000, 1200, false, 'active', 'Synthetic active staging plan.'
      )
    `);

    const anonPlans = await runAs(db, "anon", null, async () => {
      return (await db.query(`SELECT plan_code, status FROM public.investment_plans`)).rows;
    });
    assert(anonPlans.length === 1 && anonPlans[0].status === "active", `Anon should see ONLY 1 active plan, saw: ${JSON.stringify(anonPlans)}`);

    // Investor 2 has no positions in paused/archived plans -> should see ONLY active plan
    const inv2Plans = await runAs(db, "authenticated", USERS.inv2, async () => {
      return (await db.query(`SELECT plan_code, status FROM public.investment_plans`)).rows;
    });
    assert(inv2Plans.length === 1 && inv2Plans[0].status === "active", `Investor 2 should see ONLY active plan, saw: ${JSON.stringify(inv2Plans)}`);

    // Investor 1 holds historical positions in paused & archived plans -> retains read visibility for own holdings
    const inv1Plans = await runAs(db, "authenticated", USERS.inv1, async () => {
      return (await db.query(`SELECT plan_code, status FROM public.investment_plans`)).rows;
    });
    assert(inv1Plans.length === 3, `Investor 1 should see active + own historical positions (3), saw ${inv1Plans.length}`);

    return "anon sees 1/1 active plan only; Investor 2 sees 1/1 active plan only; Investor 1 retains own historical holdings";
  });

  await test("E. Phase B.5 Hardening", "Final full-wallet reconciliation & total SECURITY DEFINER search_path audit post-Migration 0013", async () => {
    const unpinned = await db.query(`
      SELECT p.proname
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.prosecdef = true
        AND (p.proconfig IS NULL OR NOT ('search_path=public, pg_temp' = ANY(p.proconfig)))
    `);
    assert(unpinned.rows.length === 0, "All SECURITY DEFINER functions must pin search_path=public, pg_temp");

    const recon = await runAs(db, "service_role", null, async () => {
      return (await db.query(`SELECT * FROM public.reconcile_wallet_balance($1)`, [w1.id])).rows[0];
    });
    assert(recon.is_reconciled === true, "Final reconciliation must pass with zero drift");
    return "All SECURITY DEFINER functions pinned; final wallet reconciliation delta=0";
  });

  // =========================================================================
  // SUITE F: FINAL SECURITY AUDIT — ADVERSARIAL IMPERSONATION & GUARDRAIL TESTS
  // =========================================================================
  console.log("\nSuite F: Final Security Audit — Adversarial Impersonation & Financial Guardrails (Migration 0014)");

  await test("F. Adversarial Audit", "Investor, Finance Officer, Admin & Super Admin CANNOT impersonate service_role via spoofed JWT GUCs", async () => {
    const wdSpoofId = await runAs(db, "authenticated", USERS.inv1, async () => {
      return (await db.query(`SELECT public.request_withdrawal(1000000, $1, 'wd-adv-spoof-1') AS id`, [inv1BankId])).rows[0].id;
    });

    // Helper: attempt BOTH legacy request.jwt.claim.role AND modern PostgREST request.jwt.claims spoofing
    const runSpoofed = async (userId, fn) => {
      await db.exec("BEGIN");
      try {
        await db.exec("SET LOCAL ROLE authenticated");
        await db.exec(`SELECT set_config('request.jwt.claim.sub', '${userId}', true)`);
        await db.exec(`SELECT set_config('request.jwt.claim.role', 'service_role', true)`);
        await db.exec(`SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
        const out = await fn();
        await db.exec("COMMIT");
        return out;
      } catch (err) {
        await db.exec("ROLLBACK");
        throw err;
      }
    };

    // 1. Investor spoofing service_role GUCs
    await expectError(
      () => runSpoofed(USERS.inv1, () => db.query(`SELECT * FROM public.reconcile_wallet_balance($1)`, [w1.id])),
      /UNAUTHORIZED_RECONCILIATION/,
      "Investor GUC spoof on reconcile_wallet_balance",
    );
    await expectError(
      () =>
        runSpoofed(USERS.inv1, () =>
          db.query(`SELECT public.fail_or_decline_withdrawal($1, 'Investor spoofed fail', 'failed', 'adv-spoof-inv')`, [wdSpoofId]),
        ),
      /VERIFIED_FAILURE_SERVICE_REQUIRED/,
      "Investor GUC spoof on fail_or_decline_withdrawal(failed)",
    );
    const spoofEnum = await runSpoofed(USERS.inv1, async () => {
      return (await db.query(`SELECT public.app_has_role($1, 'super_admin') AS is_sup`, [USERS.supA])).rows[0].is_sup;
    });
    assert(spoofEnum === false, "Spoofed JWT GUCs must not bypass anti-role-enumeration");

    // 2. Finance Officer spoofing service_role GUCs
    await expectError(
      () =>
        runSpoofed(USERS.finA, () =>
          db.query(`SELECT public.fail_or_decline_withdrawal($1, 'FinA spoofed fail', 'failed', 'adv-spoof-fin')`, [wdSpoofId]),
        ),
      /VERIFIED_FAILURE_SERVICE_REQUIRED/,
      "Finance Officer GUC spoof on fail_or_decline_withdrawal(failed)",
    );

    // 3. Admin spoofing service_role GUCs
    await expectError(
      () => runSpoofed(USERS.adm, () => db.query(`SELECT * FROM public.reconcile_wallet_balance($1)`, [w1.id])),
      /UNAUTHORIZED_RECONCILIATION/,
      "Admin GUC spoof on reconcile_wallet_balance",
    );

    // 4. Super Admin spoofing service_role GUCs
    await expectError(
      () =>
        runSpoofed(USERS.supA, () =>
          db.query(`SELECT public.fail_or_decline_withdrawal($1, 'SuperAdmin spoofed fail', 'failed', 'adv-spoof-sup')`, [wdSpoofId]),
        ),
      /VERIFIED_FAILURE_SERVICE_REQUIRED/,
      "Super Admin GUC spoof on fail_or_decline_withdrawal(failed)",
    );

    // Cleanly decline the pending withdrawal as independent FinA
    await runAs(db, "authenticated", USERS.finA, async () => {
      await db.query(`SELECT public.fail_or_decline_withdrawal($1, 'Cleanup after spoof test', 'declined', 'adv-spoof-clean')`, [wdSpoofId]);
    });

    return "All 4 roles (investor, finance_officer, admin, super_admin) blocked from GUC service_role impersonation";
  });

  await test("F. Adversarial Audit", "Direct unprivileged DB session, bare/user-bound service_role, malformed JSON & reconciler isolation", async () => {
    // Create unprivileged direct role to verify direct DB session impersonation fails
    await db.exec(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'adv_direct_user') THEN
          CREATE ROLE adv_direct_user NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator_sim') THEN
          CREATE ROLE authenticator_sim NOLOGIN;
        END IF;
      END $$;
      GRANT USAGE ON SCHEMA public TO adv_direct_user, authenticator_sim;
    `);

    // 1. Direct unprivileged session attempting settle_verified_deposit & internal_post_journal_entry with spoofed GUCs
    await expectError(
      async () => {
        await db.exec("BEGIN");
        try {
          await db.exec("SET LOCAL ROLE adv_direct_user");
          await db.exec(`SELECT set_config('request.jwt.claim.role', 'service_role', true)`);
          await db.exec(`SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
          await db.query(`SELECT public.settle_verified_deposit('PSK-FAKE', 1000000, 'FAKE-REF', 'adv-direct-1')`);
          await db.exec("COMMIT");
        } catch (e) {
          await db.exec("ROLLBACK");
          throw e;
        }
      },
      /permission denied/i,
      "Direct unprivileged user calling settle_verified_deposit",
    );

    // 2. Direct authenticator role without SET ROLE service_role cannot execute privileged RPCs
    await expectError(
      async () => {
        await db.exec("BEGIN");
        try {
          await db.exec("SET LOCAL ROLE authenticator_sim");
          await db.exec(`SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
          await db.query(`SELECT public.settle_withdrawal('00000000-0000-4000-8000-000000000001', 'NIP-FAKE', 'adv-auth-1')`);
          await db.exec("COMMIT");
        } catch (e) {
          await db.exec("ROLLBACK");
          throw e;
        }
      },
      /permission denied/i,
      "Direct authenticator session calling settle_withdrawal",
    );

    // 3. service_role WITH a user sub claim MUST be rejected by internal_assert_service_caller()
    await expectError(
      async () => {
        await db.exec("BEGIN");
        try {
          await db.exec("SET LOCAL ROLE service_role");
          await db.exec(`SELECT set_config('request.jwt.claim.role', 'service_role', true)`);
          await db.exec(`SELECT set_config('request.jwt.claim.sub', '${USERS.inv1}', true)`);
          await db.query(`SELECT public.settle_verified_deposit('PSK-SUB-FAIL', 1000000, 'VERIFY-SUB', 'adv-sub-1')`);
          await db.exec("COMMIT");
        } catch (e) {
          await db.exec("ROLLBACK");
          throw e;
        }
      },
      /UNAUTHORIZED_SERVICE_CALL/,
      "service_role with user sub claim",
    );

    // 4. Bare SET LOCAL ROLE service_role WITHOUT JWT role claim MUST be rejected
    await expectError(
      async () => {
        await db.exec("BEGIN");
        try {
          await db.exec("SET LOCAL ROLE service_role");
          await db.exec(`SELECT set_config('request.jwt.claim.role', '', true)`);
          await db.exec(`SELECT set_config('request.jwt.claim.sub', '', true)`);
          await db.exec(`SELECT set_config('request.jwt.claims', '', true)`);
          await db.query(`SELECT public.settle_verified_deposit('PSK-BARE-FAIL', 1000000, 'VERIFY-BARE', 'adv-bare-1')`);
          await db.exec("COMMIT");
        } catch (e) {
          await db.exec("ROLLBACK");
          throw e;
        }
      },
      /UNAUTHORIZED_SERVICE_CALL/,
      "Bare service_role without JWT role claim",
    );

    // 5. Malformed request.jwt.claims JSON MUST fail closed
    await expectError(
      async () => {
        await db.exec("BEGIN");
        try {
          await db.exec("SET LOCAL ROLE service_role");
          await db.exec(`SELECT set_config('request.jwt.claim.role', 'service_role', true)`);
          await db.exec(`SELECT set_config('request.jwt.claims', '{not-valid-json', true)`);
          await db.query(`SELECT public.settle_verified_deposit('PSK-BADJSON', 1000000, 'VERIFY-JSON', 'adv-json-1')`);
          await db.exec("COMMIT");
        } catch (e) {
          await db.exec("ROLLBACK");
          throw e;
        }
      },
      /UNAUTHORIZED_SERVICE_CALL/,
      "Malformed JSON in request.jwt.claims",
    );

    // 6. Legitimate Supabase PostgREST v10+ JSON request.jwt.claims = {"role":"service_role"} (no legacy claim) SUCCEEDS
    const pgRestV10Recon = await (async () => {
      await db.exec("BEGIN");
      try {
        await db.exec("SET LOCAL ROLE service_role");
        await db.exec(`SELECT set_config('request.jwt.claim.role', '', true)`);
        await db.exec(`SELECT set_config('request.jwt.claim.sub', '', true)`);
        await db.exec(`SELECT set_config('request.jwt.claims', '{"role":"service_role","iss":"supabase"}', true)`);
        const r = (await db.query(`SELECT * FROM public.reconcile_wallet_balance($1)`, [w1.id])).rows[0];
        await db.exec("COMMIT");
        return r;
      } catch (e) {
        await db.exec("ROLLBACK");
        throw e;
      }
    })();
    assert(pgRestV10Recon.is_reconciled === true, "PostgREST v10+ JSON service_role claim must succeed on reconcile_wallet_balance");

    // 7. silver_spoon_reconciler can reconcile, but CANNOT execute settlement or failure-release RPCs
    const reconcilerOk = await (async () => {
      await db.exec("BEGIN");
      try {
        await db.exec("SET LOCAL ROLE silver_spoon_reconciler");
        await db.exec(`SELECT set_config('request.jwt.claim.role', '', true)`);
        await db.exec(`SELECT set_config('request.jwt.claim.sub', '', true)`);
        await db.exec(`SELECT set_config('request.jwt.claims', '', true)`);
        const r = (await db.query(`SELECT * FROM public.reconcile_wallet_balance($1)`, [w1.id])).rows[0];
        await db.exec("COMMIT");
        return r;
      } catch (e) {
        await db.exec("ROLLBACK");
        throw e;
      }
    })();
    assert(reconcilerOk.is_reconciled === true, "silver_spoon_reconciler must succeed on reconcile_wallet_balance");

    await expectError(
      async () => {
        await db.exec("BEGIN");
        try {
          await db.exec("SET LOCAL ROLE silver_spoon_reconciler");
          await db.query(`SELECT public.settle_verified_deposit('PSK-REC', 1000000, 'VERIFY-REC', 'adv-rec-1')`);
          await db.exec("COMMIT");
        } catch (e) {
          await db.exec("ROLLBACK");
          throw e;
        }
      },
      /permission denied/i,
      "silver_spoon_reconciler calling settle_verified_deposit",
    );

    return "Direct unprivileged sessions, bare/sub-bound/malformed service_role blocked; PostgREST v10+ JSON & reconciler isolation verified";
  });

  await test("F. Adversarial Audit", "Zero anon RPC execute grants + internal_* primitives blocked even for service_role", async () => {
    const anonExec = (
      await db.query(`
        SELECT p.proname
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND has_function_privilege('anon', p.oid, 'EXECUTE')
      `)
    ).rows;
    assert(anonExec.length === 0, `anon must have 0 EXECUTE grants on public functions, found: ${anonExec.map((r) => r.proname).join(", ")}`);

    const authInternal = (
      await db.query(`
        SELECT p.proname
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND (p.proname LIKE 'internal_%' OR p.proname IN ('settle_verified_deposit', 'settle_withdrawal'))
          AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
      `)
    ).rows;
    assert(authInternal.length === 0, `authenticated must have 0 EXECUTE grants on internal/settlement RPCs: ${authInternal.map((r) => r.proname).join(", ")}`);

    // Even service_role must NOT be able to invoke low-level internal_post_journal_entry directly
    await expectError(
      () =>
        runAs(db, "service_role", null, async () => {
          await db.query(
            `SELECT public.internal_post_journal_entry('srv-raw-je', 'manual', 'RAW-1', 'Direct internal call', NULL, '[]'::jsonb)`,
          );
        }),
      /permission denied/i,
      "service_role calling internal_post_journal_entry directly",
    );

    const srvPrimitives = (
      await db.query(`
        SELECT p.proname
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN (
            'internal_is_service_caller',
            'internal_is_reconciler_caller',
            'internal_assert_service_caller',
            'internal_get_open_period_id',
            'internal_get_system_account_id',
            'internal_post_journal_entry',
            'internal_write_audit_log'
          )
          AND has_function_privilege('service_role', p.oid, 'EXECUTE')
      `)
    ).rows;
    assert(srvPrimitives.length === 0, `service_role must not have direct EXECUTE on internal primitives: ${srvPrimitives.map((r) => r.proname).join(", ")}`);

    return "0 anon RPC grants; 0 authenticated internal/settlement grants; 0 service_role direct internal_* primitive grants";
  });

  await test("F. Adversarial Audit", "Financial guardrails: block declining approved withdrawal, cross-user deposit key leak, expired approvals, daily cap & empty idempotency key", async () => {
    // 1. In-flight approved withdrawal CANNOT be declined by staff (prevents double-spend)
    const wdInflight = await runAs(db, "authenticated", USERS.inv1, async () => {
      return (await db.query(`SELECT public.request_withdrawal(1000000, $1, 'wd-adv-inflight') AS id`, [inv1BankId])).rows[0].id;
    });
    await runAs(db, "authenticated", USERS.finA, async () => {
      await db.query(`SELECT public.approve_withdrawal_four_eyes($1, 'Approved before decline test')`, [wdInflight]);
    });
    await expectError(
      () =>
        runAs(db, "authenticated", USERS.finB, async () => {
          await db.query(`SELECT public.fail_or_decline_withdrawal($1, 'Attempted decline after approval', 'declined', 'decl-after-app')`, [wdInflight]);
        }),
      /INVALID_DECLINE_STATE/,
      "Declining already-approved withdrawal",
    );
    // Cleanly release via verified service_role failure callback
    await runAs(db, "service_role", null, async () => {
      await db.query(`SELECT public.fail_or_decline_withdrawal($1, 'Verified bank failure callback', 'failed', 'srv-fail-inflight')`, [wdInflight]);
    });

    // 2. Cross-user deposit idempotency key collision MUST NOT leak Investor 1's transaction UUID to Investor 2
    await expectError(
      () =>
        runAs(db, "authenticated", USERS.inv2, async () => {
          await db.query(
            `SELECT public.initialize_deposit(2000000, 'paystack_checkout_card', 'PSK-INV2-COLLIDE', 'dep-init-001')`,
          );
        }),
      /duplicate key|unique/i,
      "Cross-user deposit idempotency collision",
    );

    // 3. Expired admin_action CANNOT be approved
    const wdExpired = await runAs(db, "authenticated", USERS.inv1, async () => {
      return (await db.query(`SELECT public.request_withdrawal(1000000, $1, 'wd-adv-expired') AS id`, [inv1BankId])).rows[0].id;
    });
    const actId = (await db.query(`SELECT four_eyes_action_id FROM public.withdrawals WHERE id = $1`, [wdExpired])).rows[0].four_eyes_action_id;
    await db.query(`UPDATE public.admin_actions SET expires_at = now() - interval '1 minute' WHERE id = $1`, [actId]);
    await expectError(
      () =>
        runAs(db, "authenticated", USERS.finA, async () => {
          await db.query(`SELECT public.approve_withdrawal_four_eyes($1, 'Late approval attempt')`, [wdExpired]);
        }),
      /ACTION_EXPIRED/,
      "Approving expired withdrawal action",
    );
    await runAs(db, "authenticated", USERS.finA, async () => {
      await db.query(`SELECT public.fail_or_decline_withdrawal($1, 'Expired action cleanup decline', 'declined', 'decl-exp-clean')`, [wdExpired]);
    });

    // 4. Empty idempotency key rejected upfront
    await expectError(
      () =>
        runAs(db, "authenticated", USERS.inv1, async () => {
          await db.query(`SELECT public.request_withdrawal(1000000, $1, '   ')`, [inv1BankId]);
        }),
      /INVALID_IDEMPOTENCY_KEY/,
      "Blank idempotency key in request_withdrawal",
    );

    // 5. Daily Tier 2 withdrawal limit enforced (Tier 2 cap = 500,000,000 kobo)
    await expectError(
      () =>
        runAs(db, "authenticated", USERS.inv1, async () => {
          await db.query(`SELECT public.request_withdrawal(500000001, $1, 'wd-over-daily-cap')`, [inv1BankId]);
        }),
      /DAILY_WITHDRAWAL_LIMIT_EXCEEDED/,
      "Withdrawal exceeding Tier 2 daily limit",
    );

    // 6. Final reconciliation check across Investor 1 wallet after all adversarial tests
    const finalRecon = await runAs(db, "service_role", null, async () => {
      return (await db.query(`SELECT * FROM public.reconcile_wallet_balance($1)`, [w1.id])).rows[0];
    });
    assert(finalRecon.is_reconciled === true, "Wallet must reconcile cleanly after all adversarial tests");

    return "Approved-withdrawal decline blocked; cross-user idempotency leak closed; expired approval, blank key & daily cap rejected; recon delta=0";
  });

  // Catalog Inventory Metrics (exact ground-truth from PostgreSQL pg_catalog)
  const inv = await db.query(`
    SELECT
      (SELECT COUNT(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r') AS tables_count,
      (SELECT COUNT(*)::int FROM pg_indexes WHERE schemaname='public') AS indexes_count,
      (SELECT COUNT(*)::int FROM pg_constraint con JOIN pg_namespace n ON n.oid=con.connamespace WHERE n.nspname='public') AS constraints_count,
      (SELECT COUNT(*)::int FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal) AS triggers_count,
      (SELECT COUNT(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public') AS functions_count,
      (SELECT COUNT(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prosecdef = true) AS security_definer_count,
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

/**
 * Seed script: insert the 11 built-in MVP OBD-II Mode 01 PIDs into
 * PIDDefinition.
 *
 * Run with: `npm run seed:pid-mvp`
 *   (or `ts-node prisma/seed/pid-mvp-seed.ts`)
 *
 * Source: hard-coded table below (per
 * specs/006-live-data-and-sensor-monitoring/contracts/pid-definition-contract.md).
 *
 * Behavior:
 *   - Idempotent: re-running the script updates existing rows by
 *     (namespace, mode, pid) and adds any new ones.
 *   - `namespace` is the literal `'STD_OBD2'`.
 *   - `mode` is the literal `'01'`.
 *   - `pid` is the 2-char hex (uppercase, no leading zero padding beyond 2).
 *   - `formula` is the restricted-grammar expression. All MVP formulas
 *     pass the PidDecoderService grammar check.
 *   - `source` is `'built-in-mvp'`.
 *   - `min` and `max` are informational only and are not enforced at
 *     decode time.
 *
 * The seed is deliberately small (11 rows) and lives in TypeScript so
 * the MVP set is reviewable in code review, not in an external asset.
 */

import { PrismaClient, Prisma } from '@prisma/client';
import {
  BUILT_IN_MVP_PIDS,
  BUILT_IN_MVP_PID_SOURCE,
  STD_OBD2_MODE_01,
  STD_OBD2_NAMESPACE,
} from '../../src/live-data/constants/built-in-pids';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  let inserted = 0;
  let updated = 0;

  try {
    for (const pid of BUILT_IN_MVP_PIDS) {
      const min = pid.min === null ? null : new Prisma.Decimal(pid.min);
      const max = pid.max === null ? null : new Prisma.Decimal(pid.max);
      const existing = await prisma.pIDDefinition.findUnique({
        where: {
          namespace_mode_pid: {
            namespace: pid.namespace,
            mode: pid.mode,
            pid: pid.pid,
          },
        },
      });
      if (existing) {
        await prisma.pIDDefinition.update({
          where: {
            namespace_mode_pid: {
              namespace: pid.namespace,
              mode: pid.mode,
              pid: pid.pid,
            },
          },
          data: {
            name: pid.name,
            unit: pid.unit,
            formula: pid.formula,
            min,
            max,
            source: pid.source,
          },
        });
        updated++;
      } else {
        await prisma.pIDDefinition.create({
          data: {
            namespace: pid.namespace,
            mode: pid.mode,
            pid: pid.pid,
            name: pid.name,
            unit: pid.unit,
            formula: pid.formula,
            min,
            max,
            source: pid.source,
          },
        });
        inserted++;
      }
    }
    // eslint-disable-next-line no-console
    console.log(
      `seed:pid-mvp — inserted ${inserted} rows, updated ${updated} rows (namespace=${STD_OBD2_NAMESPACE}, mode=${STD_OBD2_MODE_01}, source=${BUILT_IN_MVP_PID_SOURCE})`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('seed:pid-mvp failed:', err);
  process.exit(1);
});

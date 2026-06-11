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

interface MvpPid {
  pid: string;
  name: string;
  unit: string;
  formula: string;
  min: Prisma.Decimal | null;
  max: Prisma.Decimal | null;
}

const MVP_PIDS: MvpPid[] = [
  {
    pid: '0C',
    name: 'Engine RPM',
    unit: 'RPM',
    formula: '(A * 256 + B) / 4',
    min: new Prisma.Decimal(0),
    max: new Prisma.Decimal('16383.75'),
  },
  {
    pid: '0D',
    name: 'Vehicle Speed',
    unit: 'km/h',
    formula: 'A',
    min: new Prisma.Decimal(0),
    max: new Prisma.Decimal(255),
  },
  {
    pid: '05',
    name: 'Engine Coolant Temperature',
    unit: '°C',
    formula: 'A - 40',
    min: new Prisma.Decimal(-40),
    max: new Prisma.Decimal(215),
  },
  {
    pid: '42',
    name: 'Control Module Voltage',
    unit: 'V',
    formula: '(A * 256 + B) / 1000',
    min: new Prisma.Decimal(0),
    max: new Prisma.Decimal('65.535'),
  },
  {
    pid: '11',
    name: 'Throttle Position',
    unit: '%',
    formula: 'A * 100 / 255',
    min: new Prisma.Decimal(0),
    max: new Prisma.Decimal(100),
  },
  {
    pid: '04',
    name: 'Calculated Engine Load',
    unit: '%',
    formula: 'A * 100 / 255',
    min: new Prisma.Decimal(0),
    max: new Prisma.Decimal(100),
  },
  {
    pid: '06',
    name: 'Short Term Fuel Trim Bank 1',
    unit: '%',
    formula: '(A - 128) * 100 / 128',
    min: new Prisma.Decimal(-100),
    max: new Prisma.Decimal('99.22'),
  },
  {
    pid: '07',
    name: 'Long Term Fuel Trim Bank 1',
    unit: '%',
    formula: '(A - 128) * 100 / 128',
    min: new Prisma.Decimal(-100),
    max: new Prisma.Decimal('99.22'),
  },
  {
    pid: '10',
    name: 'MAF Air Flow',
    unit: 'g/s',
    formula: '(A * 256 + B) / 100',
    min: new Prisma.Decimal(0),
    max: new Prisma.Decimal('655.35'),
  },
  {
    pid: '0F',
    name: 'Intake Air Temperature',
    unit: '°C',
    formula: 'A - 40',
    min: new Prisma.Decimal(-40),
    max: new Prisma.Decimal(215),
  },
  {
    pid: '14',
    name: 'O2 Sensor Bank 1 Sensor 1 Voltage',
    unit: 'V',
    formula: 'A / 200',
    min: new Prisma.Decimal(0),
    max: new Prisma.Decimal('1.275'),
  },
];

const NAMESPACE = 'STD_OBD2';
const MODE = '01';
const SOURCE = 'built-in-mvp';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  let inserted = 0;
  let updated = 0;

  try {
    for (const pid of MVP_PIDS) {
      const existing = await prisma.pIDDefinition.findUnique({
        where: {
          namespace_mode_pid: {
            namespace: NAMESPACE,
            mode: MODE,
            pid: pid.pid,
          },
        },
      });
      if (existing) {
        await prisma.pIDDefinition.update({
          where: {
            namespace_mode_pid: {
              namespace: NAMESPACE,
              mode: MODE,
              pid: pid.pid,
            },
          },
          data: {
            name: pid.name,
            unit: pid.unit,
            formula: pid.formula,
            min: pid.min,
            max: pid.max,
            source: SOURCE,
          },
        });
        updated++;
      } else {
        await prisma.pIDDefinition.create({
          data: {
            namespace: NAMESPACE,
            mode: MODE,
            pid: pid.pid,
            name: pid.name,
            unit: pid.unit,
            formula: pid.formula,
            min: pid.min,
            max: pid.max,
            source: SOURCE,
          },
        });
        inserted++;
      }
    }
    // eslint-disable-next-line no-console
    console.log(
      `seed:pid-mvp — inserted ${inserted} rows, updated ${updated} rows (namespace=${NAMESPACE}, mode=${MODE})`,
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

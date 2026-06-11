import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { existsSync, mkdirSync } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { join, basename } from 'path';

const execFileAsync = promisify(execFile);

/**
 * AssetLoaderService — Feature 006 Phase A.
 *
 * Lazily decompresses read-only data assets (.xz) to a runtime directory.
 * The runtime directory is git-ignored and survives across restarts, so the
 * decompression cost is paid at most once per asset per machine.
 *
 * MVP supports XZ (LZMA2) compressed assets, decompressed via the system
 * `xz` binary. Pure-JS fallback is intentionally out of scope to avoid an
 * additional dependency.
 */
@Injectable()
export class AssetLoaderService implements OnModuleInit {
  private readonly logger = new Logger(AssetLoaderService.name);
  private readonly dataDir: string;
  private readonly runtimeDir: string;

  constructor() {
    this.dataDir = process.env.ASSET_DATA_DIR ?? join(process.cwd(), 'data');
    this.runtimeDir =
      process.env.ASSET_RUNTIME_DIR ?? join(this.dataDir, '_runtime');
  }

  async onModuleInit(): Promise<void> {
    if (!existsSync(this.runtimeDir)) {
      mkdirSync(this.runtimeDir, { recursive: true });
      this.logger.log(`Created runtime asset dir at ${this.runtimeDir}`);
    }
  }

  /**
   * Returns the absolute path to a usable copy of the asset. If a previously
   * decompressed copy exists in the runtime dir, that is returned immediately
   * (no decompression). Otherwise the .xz is decompressed in-place to the
   * runtime dir.
   *
   * If the source .xz does not exist on disk the method returns null. The
   * caller is expected to handle that gracefully (e.g. log a warning, return
   * a service-unavailable response) — missing assets are not fatal.
   */
  async materialize(relativePath: string): Promise<string | null> {
    const src = join(this.dataDir, relativePath);
    if (!existsSync(src)) {
      this.logger.warn(`Source asset missing: ${src}`);
      return null;
    }

    const emittedName = basename(relativePath).replace(/\.xz$/, '');
    const target = join(this.runtimeDir, emittedName);
    if (existsSync(target)) {
      return target;
    }

    mkdirSync(this.runtimeDir, { recursive: true });

    this.logger.log(`Decompressing ${src} → ${target}`);
    try {
      // `xz -d -k` decompresses in place and keeps the source. We run it
      // with cwd=runtimeDir so the output lands there.
      await execFileAsync('xz', ['--decompress', '--keep', '--force', src], {
        cwd: this.runtimeDir,
      });
    } catch (err) {
      this.logger.error(
        `Failed to decompress ${src}: ${(err as Error).message}`,
      );
      return null;
    }

    if (!existsSync(target)) {
      this.logger.error(
        `Decompression reported success but output missing: ${target}`,
      );
      return null;
    }
    return target;
  }
}

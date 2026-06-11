import { Module } from '@nestjs/common';
import { AssetLoaderService } from './assets/asset-loader.service';

@Module({
  providers: [AssetLoaderService],
  exports: [AssetLoaderService],
})
export class SharedModule {}

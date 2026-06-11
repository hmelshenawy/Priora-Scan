import '../../types/auth.types';
import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Query,
  Param,
  UseGuards,
  Req,
  BadRequestException,
  ServiceUnavailableException,
  NotFoundException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { VehicleService } from '../services/vehicle.service';
import { VehicleDecodeService } from '../services/vehicle-decode.service';
import { CreateVehicleDto } from '../dtos/create-vehicle.dto';
import { UpdateVehicleDto } from '../dtos/update-vehicle.dto';
import { VehicleListQueryDto } from '../dtos/vehicle-list-query.dto';
import { VehicleResponseDto } from '../dtos/vehicle-response.dto';
import { VehicleDecodeResponseDto } from '../dtos/vehicle-decode-response.dto';
import { VehicleDetailResponseDto } from '../dtos/vehicle-detail-response.dto';
import { PaginatedVehicleListDto } from '../dtos/paginated-vehicle-list.dto';
import { AuthGuard } from '../../guards/auth.guard';
import { TenantGuard } from '../../guards/tenant.guard';
import { RbacGuard } from '../../guards/rbac.guard';
import { CsrfGuard } from '../../guards/csrf.guard';
import { Permissions } from '../../decorators/permissions.decorator';

@Controller('/api/v1/vehicles')
@UseGuards(AuthGuard, TenantGuard, RbacGuard)
export class VehicleController {
  constructor(
    private vehicleService: VehicleService,
    private vehicleDecodeService: VehicleDecodeService,
  ) {}

  @Post()
  @UseGuards(CsrfGuard)
  @HttpCode(HttpStatus.CREATED)
  @Permissions('create:vehicle')
  async create(
    @Body() dto: CreateVehicleDto,
    @Req() req: Request,
  ): Promise<VehicleResponseDto> {
    const organizationId = req.organizationId!;
    const userId = req.user!.sub;

    return this.vehicleService.create(dto, organizationId, userId);
  }

  @Get()
  @Permissions('read:vehicle')
  async findAll(
    @Query() query: VehicleListQueryDto,
    @Req() req: Request,
  ): Promise<PaginatedVehicleListDto> {
    const organizationId = req.organizationId!;
    return this.vehicleService.findAll(query, organizationId);
  }

  /**
   * VIN decode endpoint — Feature 006 Phase A, US1.
   *
   * Path: `GET /api/v1/vehicles/decode?vin=...`
   *
   * Cache-aside lookup against the global VehicleDecode table. On miss,
   * consults the local VPIC SQLite asset and persists the result. The
   * returned data is intended for vehicle-form auto-fill; the user still
   * confirms before the data is written to `Vehicle`.
   */
  @Get('decode')
  @Permissions('read:vehicle')
  async decodeVin(
    @Query('vin') vin: string,
    @Req() req: Request,
  ): Promise<VehicleDecodeResponseDto> {
    const organizationId = req.organizationId!;
    const userId = req.user!.sub;
    if (!vin) {
      throw new BadRequestException({
        code: 'INVALID_VIN',
        message: 'The `vin` query parameter is required.',
      });
    }
    try {
      return await this.vehicleDecodeService.decodeVin(
        vin,
        organizationId,
        userId,
      );
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'INVALID_VIN') {
        throw new BadRequestException({
          code: 'INVALID_VIN',
          message: (err as Error).message,
        });
      }
      if (code === 'VPIC_ASSET_UNAVAILABLE') {
        throw new ServiceUnavailableException({
          code: 'VPIC_ASSET_UNAVAILABLE',
          message:
            'The VIN-decoding data asset is not currently available. Please try again later.',
        });
      }
      if (code === 'VIN_NOT_DECODED') {
        throw new NotFoundException({
          code: 'VIN_NOT_DECODED',
          message: (err as Error).message,
        });
      }
      throw err;
    }
  }

  @Get(':id')
  @Permissions('read:vehicle')
  async findOne(
    @Param('id') id: string,
    @Req() req: Request,
  ): Promise<VehicleDetailResponseDto> {
    const organizationId = req.organizationId!;
    return this.vehicleService.findOne(id, organizationId);
  }

  @Patch(':id')
  @UseGuards(CsrfGuard)
  @Permissions('update:vehicle')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateVehicleDto,
    @Req() req: Request,
  ): Promise<VehicleResponseDto> {
    const organizationId = req.organizationId!;
    const userId = req.user!.sub;

    return this.vehicleService.update(id, dto, organizationId, userId);
  }
}

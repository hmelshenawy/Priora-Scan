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
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { VehicleService } from '../services/vehicle.service';
import { CreateVehicleDto } from '../dtos/create-vehicle.dto';
import { UpdateVehicleDto } from '../dtos/update-vehicle.dto';
import { VehicleListQueryDto } from '../dtos/vehicle-list-query.dto';
import { VehicleResponseDto } from '../dtos/vehicle-response.dto';
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
  constructor(private vehicleService: VehicleService) {}

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

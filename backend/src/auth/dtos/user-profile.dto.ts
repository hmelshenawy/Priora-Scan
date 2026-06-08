import { IsString, IsArray, IsEmail, IsUUID } from 'class-validator';

export class UserProfileDto {
  @IsUUID()
  id: string;

  @IsEmail()
  email: string;

  @IsUUID()
  organizationId: string;

  @IsArray()
  @IsString({ each: true })
  roles: string[];

  @IsArray()
  @IsString({ each: true })
  permissions: string[];
}

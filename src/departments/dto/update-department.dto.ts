import { IsString, IsOptional, IsUUID, ValidateIf } from 'class-validator';

export class UpdateDepartmentDto {
  @IsString()
  @IsOptional()
  name?: string;

  @ValidateIf((o: UpdateDepartmentDto) => o.managerId !== null)
  @IsUUID()
  @IsOptional()
  managerId?: string | null;
}

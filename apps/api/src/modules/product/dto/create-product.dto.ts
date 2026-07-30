import { IsString, IsNumber, IsOptional, Min, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProductDto {
  @ApiProperty({ example: 'Silver' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiPropertyOptional({ example: '₹1 Lakh chit with 20 members' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 100000 })
  @IsNumber()
  @Min(1)
  totalValue: number;

  @ApiProperty({ example: 20 })
  @IsNumber()
  @Min(2)
  memberCount: number;

  @ApiProperty({ example: 5000 })
  @IsNumber()
  @Min(1)
  monthlyAmount: number;

  @ApiProperty({ example: 20 })
  @IsNumber()
  @Min(2)
  tenureMonths: number;
}

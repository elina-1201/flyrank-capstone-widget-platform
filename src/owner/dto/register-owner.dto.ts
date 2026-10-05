import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterOwnerDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;
}

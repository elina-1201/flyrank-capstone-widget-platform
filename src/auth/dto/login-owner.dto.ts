import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginOwnerDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}

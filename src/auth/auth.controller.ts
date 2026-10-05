import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { RegisterOwnerDto } from '../owner/dto/register-owner.dto';
import { AuthService } from './auth.service';
import { LoginOwnerDto } from './dto/login-owner.dto';

@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterOwnerDto) {
    return this.auth.register(dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() dto: LoginOwnerDto) {
    return this.auth.login(dto);
  }
}

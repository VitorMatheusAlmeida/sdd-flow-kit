import { Body, Controller, Get, Post, Res } from '@nestjs/common';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.authService.login(dto.username, dto.password);
    response.cookie('access_token', result.access_token, {});
    return result;
  }

  @Get('me')
  me() {
    return {};
  }
}

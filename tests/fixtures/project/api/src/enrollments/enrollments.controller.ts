import { Controller, Get, Post } from '@nestjs/common';

@Controller('enrollments')
export class EnrollmentsController {
  @Get()
  findAll() {
    return [];
  }

  @Post()
  create() {
    return {};
  }
}

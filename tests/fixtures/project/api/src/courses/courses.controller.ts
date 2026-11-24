import { Body, Controller, Get, Param, Post } from '@nestjs/common';

@Controller('courses')
export class CoursesController {
  @Get(':id')
  findOne(@Param('id') id: string) {
    return id;
  }

  @Get(':id/lessons')
  findLessons(@Param('id') id: string) {
    return id;
  }

  @Post()
  create(@Body() dto: CreateCourseDto) {
    return dto;
  }
}

import { Controller, Get, Param, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { Public } from '../../common/decorators';
import { badRequest, forbidden, notFound } from '../../common/errors';
import { StorageService } from './storage.service';

const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;

@ApiTags('files')
@Controller()
export class FilesController {
  constructor(private readonly storage: StorageService) {}

  /** Photos are compressed on the phone to ~80 KB; 6 MB is a generous ceiling for documents. */
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @Post('uploads')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  async upload(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw badRequest('file_required', 'Attach a file in the "file" field');
    return this.storage.save(file.buffer, file.mimetype);
  }

  /** Signed, expiring link — safe to drop into an <img src>. */
  @Public()
  @Get('files/:year/:month/:name')
  async download(
    @Param('year') year: string,
    @Param('month') month: string,
    @Param('name') name: string,
    @Query('exp') exp: string,
    @Query('sig') sig: string,
    @Res() res: Response,
  ) {
    const key = `${year}/${month}/${name}`;
    if (!/^\d{4}\/\d{2}\/[0-9a-f-]{36}\.(jpg|png|webp|pdf)$/.test(key)) throw notFound('File');
    if (!this.storage.verifySignature(key, Number(exp), sig ?? '')) throw forbidden('This link has expired', 'link_expired');
    if (!(await this.storage.exists(key))) throw notFound('File');
    const { stream, contentType } = this.storage.stream(key);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    stream.pipe(res);
  }
}

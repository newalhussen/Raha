import { Body, Controller, Global, Module, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { IssueDto } from '@raha/contracts';
import { Ctx } from '../../common/decorators';
import type { RequestContext } from '../../common/request-context';
import { CreateIssueDto, IssuesService } from './issues.service';

/** Anyone signed in can report a problem; Raha Operations triages it in the ops app. */
@ApiTags('issues')
@ApiBearerAuth()
@Controller('issues')
export class IssuesController {
  constructor(private readonly issues: IssuesService) {}

  @Post()
  report(@Ctx() ctx: RequestContext, @Body() dto: CreateIssueDto): Promise<IssueDto> {
    return this.issues.create(ctx, dto);
  }
}

@Global()
@Module({
  controllers: [IssuesController],
  providers: [IssuesService],
  exports: [IssuesService],
})
export class IssuesModule {}

import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthUser } from '../auth/auth.types';
import { SignaturesService } from './signatures.service';

@ApiTags('signatures')
@ApiBearerAuth()
@Roles('ASATEEL_SIGNER')
@Controller('signatures')
export class SignaturesController {
  constructor(private readonly signatures: SignaturesService) {}

  @Get()
  @ApiOperation({ summary: 'Batches waiting for the current signer' })
  list(@CurrentUser() user: AuthUser) {
    return this.signatures.list(user);
  }

  @Get(':invoiceId')
  @ApiOperation({ summary: 'One batch and its invoice rows' })
  get(@CurrentUser() user: AuthUser, @Param('invoiceId') invoiceId: string) {
    return this.signatures.get(user, invoiceId);
  }

  @Post(':invoiceId/lines/:invoiceNo/approve')
  @ApiOperation({ summary: 'Mark one invoice row approved (stage 1)' })
  approveLine(
    @CurrentUser() user: AuthUser,
    @Param('invoiceId') invoiceId: string,
    @Param('invoiceNo') invoiceNo: string,
  ) {
    return this.signatures.approveLine(user, invoiceId, invoiceNo);
  }

  @Post(':invoiceId/lines/:invoiceNo/revoke')
  @ApiOperation({ summary: 'Clear approval on one invoice row (stage 1)' })
  unapproveLine(
    @CurrentUser() user: AuthUser,
    @Param('invoiceId') invoiceId: string,
    @Param('invoiceNo') invoiceNo: string,
  ) {
    return this.signatures.unapproveLine(user, invoiceId, invoiceNo);
  }

  @Post(':invoiceId/done')
  @ApiOperation({ summary: 'Send the batch to the next signer after every row is approved' })
  complete(@CurrentUser() user: AuthUser, @Param('invoiceId') invoiceId: string) {
    return this.signatures.complete(user, invoiceId);
  }

  @Post(':invoiceId/approve')
  @ApiOperation({ summary: 'Approve the whole batch (stage 2) and send it to review' })
  approveBatch(@CurrentUser() user: AuthUser, @Param('invoiceId') invoiceId: string) {
    return this.signatures.approveBatch(user, invoiceId);
  }

  @Post(':invoiceId/reject')
  @ApiOperation({ summary: 'Reject the batch with a reason and return it to the supplier' })
  rejectBatch(
    @CurrentUser() user: AuthUser,
    @Param('invoiceId') invoiceId: string,
    @Body() body: unknown,
  ) {
    return this.signatures.rejectBatch(user, invoiceId, body);
  }
}

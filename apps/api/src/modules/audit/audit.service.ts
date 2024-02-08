import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AuditLog } from '../../database/entities';
import type { RequestContext } from '../../common/request-context';

export interface AuditInput {
  actor?: Pick<RequestContext, 'userId' | 'isStaff' | 'ip'> | null;
  action: string; // e.g. 'verification.approve'
  entityType: string;
  entityId: string;
  data?: Record<string, unknown>;
}

/** Append-only trail of consequential actions. Failures to audit never break the request. */
@Injectable()
export class AuditService {
  private readonly log = new Logger('Audit');

  constructor(@InjectRepository(AuditLog) private readonly repo: Repository<AuditLog>) {}

  async record(input: AuditInput, manager?: EntityManager): Promise<void> {
    try {
      const repo = manager ? manager.getRepository(AuditLog) : this.repo;
      await repo.save(
        repo.create({
          actorId: input.actor?.userId ?? null,
          actorType: input.actor ? (input.actor.isStaff ? 'staff' : 'user') : 'system',
          action: input.action,
          entityType: input.entityType,
          entityId: input.entityId,
          data: input.data ?? {},
          ip: input.actor?.ip ?? null,
        }),
      );
    } catch (err) {
      this.log.error(`failed to write audit entry ${input.action}: ${(err as Error).message}`);
    }
  }
}

@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}

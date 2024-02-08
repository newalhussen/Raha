import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ISSUE_KINDS, ISSUE_STATUSES, formatAge, type IssueDetailDto, type IssueDto, type IssueKind, type IssueStatus, type Paged } from '@raha/contracts';
import { badRequest, notFound } from '../../common/errors';
import type { RequestContext } from '../../common/request-context';
import { Issue, IssueComment, Organization, Shipment, Trip, User } from '../../database/entities';
import { AuditService } from '../audit/audit.service';

export class CreateIssueDto {
  @IsIn(ISSUE_KINDS) kind: IssueKind;
  @IsString() @MinLength(3) @MaxLength(160) title: string;
  @IsOptional() @IsString() @MaxLength(1000) body?: string;
  @IsOptional() @IsUUID() shipmentId?: string;
  @IsOptional() @IsUUID() tripId?: string;
  @IsOptional() @IsInt() @Min(1) @Max(4) priority?: number;
}

export class UpdateIssueDto {
  @IsOptional() @IsIn(ISSUE_STATUSES) status?: IssueStatus;
  @IsOptional() @IsUUID() assignedTo?: string;
  @IsOptional() @IsInt() @Min(1) @Max(4) priority?: number;
  @IsOptional() @IsString() @MaxLength(1000) resolution?: string;
}

export class CommentDto {
  @IsString() @MinLength(1) @MaxLength(1000) body: string;
  @IsOptional() internal?: boolean;
}

export interface IssueQuery {
  kind?: IssueKind | 'support_all';
  status?: 'open' | 'closed' | 'all';
  mine?: boolean;
  page?: number;
  pageSize?: number;
  q?: string;
}

const OPEN: IssueStatus[] = ['open', 'in_progress', 'waiting'];

@Injectable()
export class IssuesService {
  constructor(
    @InjectRepository(Issue) private readonly issues: Repository<Issue>,
    @InjectRepository(IssueComment) private readonly comments: Repository<IssueComment>,
    @InjectRepository(Shipment) private readonly shipments: Repository<Shipment>,
    @InjectRepository(Trip) private readonly trips: Repository<Trip>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Organization) private readonly orgs: Repository<Organization>,
    private readonly audit: AuditService,
  ) {}

  async create(ctx: RequestContext, dto: CreateIssueDto): Promise<IssueDto> {
    if (!dto.shipmentId && !dto.tripId && !ctx.isStaff && dto.kind !== 'support') throw badRequest('target_required', 'Say which shipment or trip this is about');
    const [{ n }] = await this.issues.query(`SELECT nextval('issue_ref_seq') AS n`);
    const issue = await this.issues.save(
      this.issues.create({
        ref: `IS-${n}`,
        kind: dto.kind,
        title: dto.title.trim(),
        body: dto.body ?? null,
        shipmentId: dto.shipmentId ?? null,
        tripId: dto.tripId ?? null,
        priority: dto.priority ?? (dto.kind === 'dispute' || dto.kind === 'safety' ? 1 : 2),
        raisedBy: ctx.userId,
        raisedByOrg: ctx.org?.id ?? null,
      }),
    );
    await this.audit.record({ actor: ctx, action: 'issue.create', entityType: 'issue', entityId: issue.id, data: { kind: dto.kind } });
    return (await this.toDtos([issue]))[0]!;
  }

  async list(q: IssueQuery): Promise<Paged<IssueDto>> {
    const page = q.page ?? 1;
    const pageSize = Math.min(q.pageSize ?? 30, 100);
    const qb = this.issues.createQueryBuilder('i');
    if (q.kind === 'support_all') qb.andWhere("i.kind <> 'dispute'");
    else if (q.kind) qb.andWhere('i.kind = :kind', { kind: q.kind });
    if ((q.status ?? 'open') === 'open') qb.andWhere('i.status IN (:...open)', { open: OPEN });
    else if (q.status === 'closed') qb.andWhere("i.status IN ('resolved','closed')");
    if (q.q?.trim()) qb.andWhere('(i.ref ILIKE :like OR i.title ILIKE :like)', { like: `%${q.q.trim()}%` });
    qb.orderBy('i.priority', 'ASC').addOrderBy('i.createdAt', 'DESC').skip((page - 1) * pageSize).take(pageSize);
    const [rows, total] = await qb.getManyAndCount();
    return { items: await this.toDtos(rows), total, page, pageSize };
  }

  async openCounts(): Promise<{ support: number; disputes: number }> {
    const rows = await this.issues.query(
      `SELECT count(*) FILTER (WHERE kind <> 'dispute')::int AS support, count(*) FILTER (WHERE kind = 'dispute')::int AS disputes
         FROM issues WHERE status IN ('open','in_progress','waiting')`,
    );
    return { support: rows[0]?.support ?? 0, disputes: rows[0]?.disputes ?? 0 };
  }

  async detail(id: string): Promise<IssueDetailDto> {
    const issue = await this.issues.findOne({ where: { id } });
    if (!issue) throw notFound('Issue');
    const [dto] = await this.toDtos([issue]);
    const comments = await this.comments.find({ where: { issueId: id }, relations: { author: true }, order: { createdAt: 'ASC' } });
    return {
      ...dto!,
      comments: comments.map((c) => ({ id: c.id, author: c.author?.fullName ?? 'Raha', body: c.body, internal: c.internal, createdAt: c.createdAt.toISOString() })),
    };
  }

  async update(ctx: RequestContext, id: string, dto: UpdateIssueDto): Promise<IssueDetailDto> {
    const issue = await this.issues.findOne({ where: { id } });
    if (!issue) throw notFound('Issue');
    const patch: Partial<Issue> = {};
    if (dto.status) {
      patch.status = dto.status;
      patch.resolvedAt = ['resolved', 'closed'].includes(dto.status) ? new Date() : null;
    }
    if (dto.assignedTo) patch.assignedTo = dto.assignedTo;
    if (dto.priority) patch.priority = dto.priority;
    if (dto.resolution !== undefined) patch.resolution = dto.resolution;
    if (!dto.assignedTo && dto.status === 'in_progress' && !issue.assignedTo) patch.assignedTo = ctx.userId;
    await this.issues.update(id, patch as never);
    await this.audit.record({ actor: ctx, action: 'issue.update', entityType: 'issue', entityId: id, data: { ...dto } });
    return this.detail(id);
  }

  async comment(ctx: RequestContext, id: string, dto: CommentDto): Promise<IssueDetailDto> {
    if (!(await this.issues.exist({ where: { id } }))) throw notFound('Issue');
    await this.comments.save(this.comments.create({ issueId: id, authorId: ctx.userId, body: dto.body.trim(), internal: dto.internal !== false }));
    await this.issues.update(id, { updatedAt: new Date() });
    return this.detail(id);
  }

  private async toDtos(rows: Issue[]): Promise<IssueDto[]> {
    if (!rows.length) return [];
    const shipmentIds = [...new Set(rows.map((r) => r.shipmentId).filter((x): x is string => !!x))];
    const tripIds = [...new Set(rows.map((r) => r.tripId).filter((x): x is string => !!x))];
    const userIds = [...new Set(rows.flatMap((r) => [r.raisedBy, r.assignedTo]).filter((x): x is string => !!x))];
    const orgIds = [...new Set(rows.map((r) => r.raisedByOrg).filter((x): x is string => !!x))];
    const [shipments, trips, users, orgs] = await Promise.all([
      shipmentIds.length ? this.shipments.find({ where: { id: In(shipmentIds) }, select: ['id', 'ref'] }) : [],
      tripIds.length ? this.trips.find({ where: { id: In(tripIds) }, select: ['id', 'ref'] }) : [],
      userIds.length ? this.users.find({ where: { id: In(userIds) }, select: ['id', 'fullName'] }) : [],
      orgIds.length ? this.orgs.find({ where: { id: In(orgIds) }, select: ['id', 'name'] }) : [],
    ]);
    const sMap = new Map(shipments.map((s) => [s.id, s.ref]));
    const tMap = new Map(trips.map((t) => [t.id, t.ref]));
    const uMap = new Map(users.map((u) => [u.id, u.fullName]));
    const oMap = new Map(orgs.map((o) => [o.id, o.name]));
    return rows.map((r) => ({
      id: r.id,
      ref: r.ref,
      kind: r.kind,
      status: r.status,
      priority: r.priority,
      title: r.title,
      body: r.body,
      shipment: r.shipmentId ? { id: r.shipmentId, ref: sMap.get(r.shipmentId) ?? '' } : null,
      trip: r.tripId ? { id: r.tripId, ref: tMap.get(r.tripId) ?? '' } : null,
      raisedBy: r.raisedBy ? uMap.get(r.raisedBy) ?? null : null,
      orgName: r.raisedByOrg ? oMap.get(r.raisedByOrg) ?? null : null,
      assignedTo: r.assignedTo ? { id: r.assignedTo, name: uMap.get(r.assignedTo) ?? 'Raha' } : null,
      actionHint: r.actionHint,
      resolution: r.resolution,
      createdAt: r.createdAt.toISOString(),
      ageLabel: formatAge(r.createdAt),
      resolvedAt: r.resolvedAt?.toISOString() ?? null,
    }));
  }
}

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { IsArray, IsIn, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { formatAge, formatTonnes, initials, type VerificationCaseDto, type VerificationDocumentDto, type VerificationQueueDto, type VerificationQueueItemDto, type VerificationSubject } from '@raha/contracts';
import { notFound } from '../../common/errors';
import type { RequestContext } from '../../common/request-context';
import { AuditLog, DriverProfile, Membership, Organization, User, Vehicle, VerificationCase, VerificationDocument } from '../../database/entities';
import { StorageService } from '../files/storage.service';
import { DOCUMENT_LABEL, REQUIRED_DOCUMENTS, VerificationService } from '../verification/verification.service';

export class DocumentDecisionDto {
  @IsUUID() documentId: string;
  @IsIn(['approved', 'rejected']) status: 'approved' | 'rejected';
  @IsOptional() @IsString() @MaxLength(200) note?: string;
}

export class DecideDto {
  @IsIn(['approve', 'reject', 'reupload']) decision: 'approve' | 'reject' | 'reupload';
  @IsOptional() @IsString() @MaxLength(300) note?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => DocumentDecisionDto) documents?: DocumentDecisionDto[];
}

@Injectable()
export class OpsVerificationService {
  constructor(
    @InjectRepository(VerificationCase) private readonly cases: Repository<VerificationCase>,
    @InjectRepository(VerificationDocument) private readonly docs: Repository<VerificationDocument>,
    @InjectRepository(DriverProfile) private readonly drivers: Repository<DriverProfile>,
    @InjectRepository(Vehicle) private readonly vehicles: Repository<Vehicle>,
    @InjectRepository(Organization) private readonly orgs: Repository<Organization>,
    @InjectRepository(Membership) private readonly memberships: Repository<Membership>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(AuditLog) private readonly audit: Repository<AuditLog>,
    private readonly verification: VerificationService,
    private readonly storage: StorageService,
  ) {}

  async queue(type?: VerificationSubject): Promise<VerificationQueueDto> {
    const open = await this.cases.find({ where: { status: In(['pending', 'in_review']) }, order: { createdAt: 'ASC' } });
    const counts = {
      driver: open.filter((c) => c.subjectType === 'driver').length,
      vehicle: open.filter((c) => c.subjectType === 'vehicle').length,
      organization: open.filter((c) => c.subjectType === 'organization').length,
      total: open.length,
    };
    const rows = type ? open.filter((c) => c.subjectType === type) : open;
    const names = await this.subjectNames(rows);
    const assignees = rows.length ? await this.users.find({ where: { id: In(rows.map((r) => r.assignedTo).filter((x): x is string => !!x)) }, select: ['id', 'fullName'] }) : [];
    const aMap = new Map(assignees.map((u) => [u.id, u.fullName]));
    const items: VerificationQueueItemDto[] = rows.map((c) => ({
      caseId: c.id,
      type: c.subjectType,
      subjectId: c.subjectId,
      name: names.get(c.id)?.name ?? '—',
      subtitle: names.get(c.id)?.subtitle ?? '',
      ageLabel: formatAge(c.createdAt),
      status: c.status,
      assignedTo: c.assignedTo ? aMap.get(c.assignedTo) ?? null : null,
    }));
    return { items, counts };
  }

  async detail(caseId: string, staff: RequestContext): Promise<VerificationCaseDto> {
    const c = await this.cases.findOne({ where: { id: caseId } });
    if (!c) throw notFound('Verification case');
    if (c.status === 'pending') await this.cases.update(c.id, { status: 'in_review', assignedTo: c.assignedTo ?? staff.userId });

    const docs = await this.docs.find({ where: { caseId }, order: { createdAt: 'ASC' } });
    const info = await this.subjectInfo(c);
    const have = new Set(docs.map((d) => d.kind));
    const history = await this.audit.find({ where: { entityType: c.subjectType, entityId: c.subjectId }, order: { createdAt: 'DESC' }, take: 20, relations: undefined });
    const actors = history.length ? await this.users.find({ where: { id: In(history.map((h) => h.actorId).filter((x): x is string => !!x)) }, select: ['id', 'fullName'] }) : [];
    const aMap = new Map(actors.map((u) => [u.id, u.fullName]));

    return {
      caseId: c.id,
      type: c.subjectType,
      status: c.status === 'pending' ? 'in_review' : c.status,
      subject: info.subject,
      documents: docs.map((d) => this.toDocDto(d, info.context)),
      facts: info.facts,
      missing: REQUIRED_DOCUMENTS[c.subjectType].filter((k) => !have.has(k)).map((k) => DOCUMENT_LABEL[k]),
      history: history.filter((h) => h.action.startsWith('verification.')).map((h) => ({ at: h.createdAt.toISOString(), by: h.actorId ? aMap.get(h.actorId) ?? null : null, action: h.action.replace('verification.', ''), note: (h.data as { note?: string }).note ?? null })),
      submittedAt: c.createdAt.toISOString(),
      decisionNote: c.decisionNote,
    };
  }

  async decide(staff: RequestContext, caseId: string, dto: DecideDto): Promise<VerificationCaseDto> {
    await this.verification.decide(staff, caseId, dto.decision, dto.note ?? null, dto.documents);
    return this.detail(caseId, staff);
  }

  // ───────────────────────── subjects ─────────────────────────

  private async subjectNames(rows: VerificationCase[]): Promise<Map<string, { name: string; subtitle: string }>> {
    const out = new Map<string, { name: string; subtitle: string }>();
    const ids = (t: VerificationSubject) => rows.filter((r) => r.subjectType === t).map((r) => r.subjectId);
    const [users, vehicles, orgs, ms] = await Promise.all([
      ids('driver').length ? this.users.find({ where: { id: In(ids('driver')) } }) : [],
      ids('vehicle').length ? this.vehicles.find({ where: { id: In(ids('vehicle')) }, relations: { owner: true } }) : [],
      ids('organization').length ? this.orgs.find({ where: { id: In(ids('organization')) } }) : [],
      ids('driver').length ? this.memberships.find({ where: { userId: In(ids('driver')), status: In(['active', 'invited']) }, relations: { organization: true } }) : [],
    ]);
    const uMap = new Map(users.map((u) => [u.id, u]));
    const vMap = new Map(vehicles.map((v) => [v.id, v]));
    const oMap = new Map(orgs.map((o) => [o.id, o]));
    const orgOf = new Map(ms.map((m) => [m.userId, m.organization]));
    for (const r of rows) {
      if (r.subjectType === 'driver') {
        const u = uMap.get(r.subjectId);
        const org = orgOf.get(r.subjectId);
        out.set(r.id, { name: u?.fullName || u?.phone || 'Driver', subtitle: `Driver · ${org && org.type === 'fleet' && !org.name.includes('(owner-operator)') ? org.name : 'independent'}` });
      } else if (r.subjectType === 'vehicle') {
        const v = vMap.get(r.subjectId);
        out.set(r.id, { name: v?.plate ?? 'Truck', subtitle: `Vehicle · ${v?.owner.name ?? ''} · ${v ? formatTonnes(v.maxLoadKg, v.maxLoadKg % 1000 === 0 ? 0 : 1) : ''}` });
      } else {
        const o = oMap.get(r.subjectId);
        out.set(r.id, { name: o?.name ?? 'Company', subtitle: o?.type === 'brokerage' ? 'Brokerage · trade licence + TIN' : `Company · TIN + trade licence` });
      }
    }
    return out;
  }

  private async subjectInfo(c: VerificationCase): Promise<{ subject: VerificationCaseDto['subject']; facts: VerificationCaseDto['facts']; context: Record<string, string | null> }> {
    if (c.subjectType === 'driver') {
      const [user, profile, vehicle, membership] = await Promise.all([
        this.users.findOneByOrFail({ id: c.subjectId }),
        this.drivers.findOne({ where: { userId: c.subjectId } }),
        this.vehicles.findOne({ where: { currentDriverId: c.subjectId } }),
        this.memberships.findOne({ where: { userId: c.subjectId, status: In(['active', 'invited']) }, relations: { organization: true } }),
      ]);
      const org = membership?.organization;
      return {
        subject: { id: user.id, name: user.fullName || user.phone, subtitle: `Driver · ${membership?.status === 'invited' ? 'invited by' : 'in'} ${org?.name ?? 'no fleet'} · ${user.phone}`, phone: user.phone, initials: initials(user.fullName || user.phone), verification: profile?.verificationStatus ?? 'unverified' },
        facts: [
          { label: 'Licence number', value: profile?.licenceNumber ?? '—' },
          { label: 'Expires', value: profile?.licenceExpiry ?? '—' },
          { label: 'Assigned truck', value: vehicle?.plate ?? 'none' },
          { label: 'Org verified', value: org ? `${org.verificationStatus === 'verified' ? '✓' : '·'} ${org.name}` : '—', ok: org?.verificationStatus === 'verified' },
        ],
        context: { grade: profile?.licenceGrade ?? null },
      };
    }
    if (c.subjectType === 'vehicle') {
      const v = await this.vehicles.findOneOrFail({ where: { id: c.subjectId }, relations: { owner: true, currentDriver: true } });
      return {
        subject: { id: v.id, name: v.plate, subtitle: `Vehicle · ${v.owner.name} · ${formatTonnes(v.maxLoadKg, v.maxLoadKg % 1000 === 0 ? 0 : 1)}`, phone: null, initials: 'TR', verification: v.verificationStatus },
        facts: [
          { label: 'Plate', value: v.plate },
          { label: 'Make / model', value: `${v.makeModel}${v.year ? ` ${v.year}` : ''}` },
          { label: 'Max load', value: `${v.maxLoadKg.toLocaleString('en-US')} kg` },
          { label: 'Owner verified', value: `${v.owner.verificationStatus === 'verified' ? '✓' : '·'} ${v.owner.name}`, ok: v.owner.verificationStatus === 'verified' },
        ],
        context: { plate: v.plate },
      };
    }
    const o = await this.orgs.findOneOrFail({ where: { id: c.subjectId } });
    return {
      subject: { id: o.id, name: o.name, subtitle: `${o.type === 'brokerage' ? 'Brokerage' : o.type === 'fleet' ? 'Fleet' : 'Shipper'} · ${o.city ?? 'Addis Ababa'}`, phone: o.phone, initials: initials(o.name), verification: o.verificationStatus },
      facts: [
        { label: 'TIN', value: o.tin ?? '—' },
        { label: 'Trade licence', value: o.tradeLicenceNo ?? '—' },
        { label: 'Type', value: o.type },
        { label: 'City', value: o.city ?? '—' },
      ],
      context: {},
    };
  }

  private toDocDto(d: VerificationDocument, ctx: Record<string, string | null>): VerificationDocumentDto {
    let hint = 'Readable';
    let state: 'ok' | 'check' = 'ok';
    if (d.reviewNote) {
      hint = d.reviewNote;
      state = 'check';
    } else if (d.kind === 'driving_licence') hint = `${ctx.grade ? `Grade ${ctx.grade}` : 'Grade not stated'} · readable`;
    else if (d.kind === 'fayda_id') hint = 'Name matches';
    else if (d.kind === 'selfie') hint = 'Face visible';
    else if (d.kind === 'libre') {
      const matches = !d.number || !ctx.plate || d.number.replace(/\s/g, '') === ctx.plate.replace(/\s/g, '');
      hint = matches ? 'Plate matches' : 'Plate differs from the truck record';
      state = matches ? 'ok' : 'check';
    }
    if (d.expiresOn && new Date(`${d.expiresOn}T00:00:00+03:00`).getTime() < Date.now()) {
      hint = `Expired ${d.expiresOn}`;
      state = 'check';
    }
    return { id: d.id, kind: d.kind, label: DOCUMENT_LABEL[d.kind], status: d.status, number: d.number, expiresOn: d.expiresOn, url: d.fileKey ? this.storage.signUrl(d.fileKey) : null, hint, hintState: state, note: d.reviewNote };
  }
}

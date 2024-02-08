import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import type { DocumentKind, VerificationCaseStatus, VerificationStatus, VerificationSubject } from '@raha/contracts';
import { badRequest, conflict, notFound } from '../../common/errors';
import type { RequestContext } from '../../common/request-context';
import {
  DriverProfile,
  Membership,
  Organization,
  User,
  Vehicle,
  VerificationCase,
  VerificationDocument,
} from '../../database/entities';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { T } from '../notifications/templates';

export interface SubmittedDocument {
  kind: DocumentKind;
  fileKey?: string | null;
  number?: string | null;
  /** YYYY-MM-DD */
  expiresOn?: string | null;
}

/** Which documents each kind of subject must provide before Raha Operations can approve it. */
export const REQUIRED_DOCUMENTS: Record<VerificationSubject, DocumentKind[]> = {
  driver: ['driving_licence', 'fayda_id', 'selfie'],
  vehicle: ['libre', 'insurance'],
  organization: ['trade_licence', 'tin_certificate'],
};

export const DOCUMENT_LABEL: Record<DocumentKind, string> = {
  driving_licence: 'Driving licence',
  fayda_id: 'Fayda national ID',
  selfie: 'Selfie with licence',
  insurance: 'Third-party insurance',
  libre: 'Vehicle registration (libre)',
  vehicle_photo: 'Truck photo',
  trade_licence: 'Trade licence',
  tin_certificate: 'TIN certificate',
};

const EXPIRY_WARN_DAYS = 30;

@Injectable()
export class VerificationService {
  private readonly log = new Logger(VerificationService.name);

  constructor(
    @InjectRepository(VerificationCase) private readonly cases: Repository<VerificationCase>,
    @InjectRepository(VerificationDocument) private readonly docs: Repository<VerificationDocument>,
    @InjectRepository(DriverProfile) private readonly drivers: Repository<DriverProfile>,
    @InjectRepository(Vehicle) private readonly vehicles: Repository<Vehicle>,
    @InjectRepository(Organization) private readonly orgs: Repository<Organization>,
    @InjectRepository(Membership) private readonly memberships: Repository<Membership>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly db: DataSource,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * A subject (driver / truck / company) hands in documents. One open case per subject:
   * resubmitting after "needs re-upload" reuses it and replaces the documents of the same kind.
   */
  async submit(actor: RequestContext, type: VerificationSubject, subjectId: string, documents: SubmittedDocument[]): Promise<VerificationCase> {
    if (!documents.length) throw badRequest('documents_required', 'Attach at least one document');
    await this.assertSubjectExists(type, subjectId);

    return this.db.transaction(async (tx) => {
      const caseRepo = tx.getRepository(VerificationCase);
      const docRepo = tx.getRepository(VerificationDocument);
      let c = await caseRepo.findOne({ where: { subjectType: type, subjectId, status: In<VerificationCaseStatus>(['pending', 'in_review', 'needs_reupload']) } });
      if (!c) c = await caseRepo.save(caseRepo.create({ subjectType: type, subjectId, status: 'pending', submittedBy: actor.userId }));
      else await caseRepo.update(c.id, { status: 'pending', decidedBy: null, decidedAt: null, decisionNote: null });

      for (const d of documents) {
        // newest upload of a kind replaces the previous pending/rejected one
        await docRepo.delete({ caseId: c.id, kind: d.kind });
        await docRepo.save(
          docRepo.create({
            caseId: c.id,
            subjectType: type,
            subjectId,
            kind: d.kind,
            fileKey: d.fileKey ?? null,
            number: d.number ?? null,
            expiresOn: d.expiresOn ?? null,
            uploadedBy: actor.userId,
          }),
        );
      }
      await this.setSubjectStatus(tx, type, subjectId, 'pending');
      await this.audit.record({ actor, action: 'verification.submit', entityType: type, entityId: subjectId, data: { caseId: c.id, kinds: documents.map((d) => d.kind) } }, tx);
      return caseRepo.findOneByOrFail({ id: c.id });
    });
  }

  /** Ops decision. `reupload` keeps the case open and asks the subject for clearer documents. */
  async decide(
    staff: RequestContext,
    caseId: string,
    decision: 'approve' | 'reject' | 'reupload',
    note: string | null,
    perDocument?: Array<{ documentId: string; status: 'approved' | 'rejected'; note?: string | null }>,
  ): Promise<VerificationCase> {
    const outcome = await this.db.transaction(async (tx) => {
      const caseRepo = tx.getRepository(VerificationCase);
      const c = await caseRepo.findOne({ where: { id: caseId }, lock: { mode: 'pessimistic_write' } });
      if (!c) throw notFound('Verification case');
      if (c.status === 'approved' || c.status === 'rejected') throw conflict('case_closed', 'This case was already decided');

      const docs = await tx.getRepository(VerificationDocument).find({ where: { caseId } });
      if (decision === 'approve') {
        const have = new Set(docs.map((d) => d.kind));
        const missing = REQUIRED_DOCUMENTS[c.subjectType].filter((k) => !have.has(k));
        if (missing.length) throw badRequest('documents_missing', `Missing: ${missing.map((k) => DOCUMENT_LABEL[k]).join(', ')}`);
        await tx.getRepository(VerificationDocument).update({ caseId }, { status: 'approved' });
      }
      for (const p of perDocument ?? []) {
        await tx.getRepository(VerificationDocument).update({ id: p.documentId, caseId }, { status: p.status, reviewNote: p.note ?? null });
      }

      const status: VerificationCaseStatus = decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'needs_reupload';
      await caseRepo.update(c.id, { status, decidedBy: staff.userId, decidedAt: new Date(), decisionNote: note });
      const subjectStatus: VerificationStatus = decision === 'approve' ? 'verified' : decision === 'reject' ? 'rejected' : 'pending';
      await this.setSubjectStatus(tx, c.subjectType, c.subjectId, subjectStatus, decision === 'approve' ? docs : undefined);
      await this.audit.record({ actor: staff, action: `verification.${decision}`, entityType: c.subjectType, entityId: c.subjectId, data: { caseId, note } }, tx);
      return { c, status };
    });

    await this.notifySubject(outcome.c.subjectType, outcome.c.subjectId, decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'needs_reupload', note);
    return this.cases.findOneByOrFail({ id: outcome.c.id });
  }

  async openCaseFor(type: VerificationSubject, subjectId: string): Promise<VerificationCase | null> {
    return this.cases.findOne({ where: { subjectType: type, subjectId }, order: { createdAt: 'DESC' } });
  }

  async documentsOf(type: VerificationSubject, subjectId: string): Promise<VerificationDocument[]> {
    return this.docs.find({ where: { subjectType: type, subjectId }, order: { createdAt: 'DESC' } });
  }

  // ───────────────────────── expiry watch ─────────────────────────

  /** Latest approved/pending document per kind that expires within the warning window (or already has). */
  async expiring(subjectType: VerificationSubject, subjectIds: string[]): Promise<Map<string, Array<{ kind: DocumentKind; expiresOn: string; daysLeft: number }>>> {
    const out = new Map<string, Array<{ kind: DocumentKind; expiresOn: string; daysLeft: number }>>();
    if (!subjectIds.length) return out;
    const rows = await this.docs
      .createQueryBuilder('d')
      .where('d.subject_type = :t AND d.subject_id IN (:...ids) AND d.expires_on IS NOT NULL AND d.status <> :rej', { t: subjectType, ids: subjectIds, rej: 'rejected' })
      .orderBy('d.createdAt', 'DESC')
      .getMany();
    const seen = new Set<string>();
    const today = Date.now();
    for (const d of rows) {
      const key = `${d.subjectId}:${d.kind}`;
      if (seen.has(key)) continue; // only the newest document of each kind counts
      seen.add(key);
      const daysLeft = Math.ceil((new Date(`${d.expiresOn}T00:00:00+03:00`).getTime() - today) / 86_400_000);
      if (daysLeft > EXPIRY_WARN_DAYS) continue;
      const list = out.get(d.subjectId) ?? [];
      list.push({ kind: d.kind, expiresOn: d.expiresOn!, daysLeft });
      out.set(d.subjectId, list);
    }
    return out;
  }

  /** Nightly: documents past their expiry date downgrade the subject to `expired` until renewed. */
  @Cron(CronExpression.EVERY_DAY_AT_1AM, { timeZone: 'Africa/Addis_Ababa' })
  async expireOverdue(): Promise<void> {
    const overdue = await this.docs
      .createQueryBuilder('d')
      .select(['d.subjectType', 'd.subjectId'])
      .distinct(true)
      .where("d.expires_on < current_date AND d.status = 'approved'")
      .getMany();
    for (const o of overdue) {
      // a newer approved document of the same kind means it was renewed
      const stale = await this.docs.query(
        `SELECT 1 FROM verification_documents d
          WHERE d.subject_type = $1 AND d.subject_id = $2 AND d.status = 'approved' AND d.expires_on < current_date
            AND NOT EXISTS (SELECT 1 FROM verification_documents n WHERE n.subject_type = d.subject_type AND n.subject_id = d.subject_id AND n.kind = d.kind AND n.created_at > d.created_at AND n.status IN ('approved','pending'))
          LIMIT 1`,
        [o.subjectType, o.subjectId],
      );
      if (!stale.length) continue;
      await this.setSubjectStatus(this.db.manager, o.subjectType, o.subjectId, 'expired');
      this.log.warn(`${o.subjectType} ${o.subjectId} marked expired`);
    }
  }

  // ───────────────────────── internals ─────────────────────────

  private async assertSubjectExists(type: VerificationSubject, id: string): Promise<void> {
    const exists =
      type === 'driver' ? await this.drivers.exist({ where: { userId: id } }) : type === 'vehicle' ? await this.vehicles.exist({ where: { id } }) : await this.orgs.exist({ where: { id } });
    if (!exists) throw notFound(type);
  }

  private async setSubjectStatus(
    tx: EntityManager,
    type: VerificationSubject,
    id: string,
    status: VerificationStatus,
    approvedDocs?: VerificationDocument[],
  ): Promise<void> {
    const stamp = status === 'verified' ? new Date() : null;
    if (type === 'driver') {
      const patch: Partial<DriverProfile> = { verificationStatus: status, verifiedAt: stamp };
      const lic = approvedDocs?.find((d) => d.kind === 'driving_licence');
      if (lic) {
        patch.licenceNumber = lic.number ?? undefined;
        patch.licenceExpiry = lic.expiresOn ?? undefined;
      }
      const fayda = approvedDocs?.find((d) => d.kind === 'fayda_id');
      if (fayda?.number) patch.faydaIdLast4 = fayda.number.slice(-4);
      await tx.getRepository(DriverProfile).update(id, patch);
    } else if (type === 'vehicle') {
      await tx.getRepository(Vehicle).update(id, { verificationStatus: status, verifiedAt: stamp });
    } else {
      await tx.getRepository(Organization).update(id, { verificationStatus: status, verifiedAt: stamp });
    }
  }

  private async notifySubject(type: VerificationSubject, id: string, outcome: 'approved' | 'rejected' | 'needs_reupload', note: string | null): Promise<void> {
    let userIds: string[] = [];
    let subject = 'Verification';
    if (type === 'driver') {
      userIds = [id];
      subject = 'Driver profile';
    } else if (type === 'vehicle') {
      const v = await this.vehicles.findOne({ where: { id } });
      if (v) {
        subject = `Truck ${v.plate}`;
        userIds = [v.currentDriverId, ...(await this.ownerUserIds(v.ownerOrgId))].filter((x): x is string => !!x);
      }
    } else {
      const o = await this.orgs.findOne({ where: { id } });
      if (o) {
        subject = `${o.name} company`;
        userIds = await this.ownerUserIds(o.id);
      }
    }
    await this.notifications.notifyMany(userIds, (userId) => ({
      userId,
      type: 'verification.decided',
      ...T.verification('en', { subject, outcome, note }),
      via: { sms: true, telegram: true },
      data: { subjectType: type, subjectId: id, outcome },
      dedupeKey: `verification:${type}:${id}:${outcome}:${new Date().toISOString().slice(0, 13)}:${userId}`,
    }));
  }

  private async ownerUserIds(orgId: string): Promise<string[]> {
    const rows = await this.memberships.find({ where: { organizationId: orgId, role: In(['owner', 'manager']), status: 'active' } });
    return rows.map((r) => r.userId);
  }
}

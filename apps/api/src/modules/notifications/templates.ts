import { formatEtb, formatKg, formatTime, type Language } from '@raha/contracts';

/**
 * Message templates. Voice rules (see brand guidelines): say the route, the weight, the time.
 * Numbers first, verbs second, no exclamation marks. Every message carries the shipment id and one action.
 */
export interface Rendered {
  title: string;
  body: string;
  /** Short form used for SMS / Telegram when different from the in-app body. */
  sms?: string;
}

type Lang = Language;
const pick = <T>(lang: Lang, en: T, am: T): T => (lang === 'am' ? am : en);

export const T = {
  loadOffered(lang: Lang, p: { weightKg: number; cargo: string; from: string; to: string; priceEtb: number; ref: string }): Rendered {
    const line = `${formatKg(p.weightKg)} ${p.cargo} · ${p.from} → ${p.to} · ${formatEtb(p.priceEtb)}`;
    return {
      title: pick(lang, 'New load fits your truck', 'ለመኪናዎ የሚሆን አዲስ ጭነት'),
      body: line,
      sms: `RAHA: ${line}. ${p.ref}. Open the Raha Driver app to accept.`,
    };
  },

  offerForShipper(lang: Lang, p: { ref: string; fleet: string; weightKg: number; from: string; to: string; priceEtb: number }): Rendered {
    return {
      title: pick(lang, `New offer for ${p.ref}`, `ለ${p.ref} አዲስ ቅናሽ`),
      body: `${p.fleet} can carry ${formatKg(p.weightKg)} ${p.from} → ${p.to} for ${formatEtb(p.priceEtb)}.`,
    };
  },

  matchConfirmedForCarrier(lang: Lang, p: { ref: string; shipper: string; pickupAddress: string; pickupAt: Date }): Rendered {
    return {
      title: pick(lang, 'Load matched', 'ጭነቱ ተመድቦልዎታል'),
      body: `${p.shipper} confirmed ${p.ref}. Head to ${p.pickupAddress} by ${formatTime(p.pickupAt)}.`,
      sms: `RAHA: ${p.ref} matched. ${p.shipper} confirmed. Pickup ${p.pickupAddress} by ${formatTime(p.pickupAt)}.`,
    };
  },

  matchConfirmedForShipper(lang: Lang, p: { ref: string; plate: string; driver: string; departsAt: Date }): Rendered {
    return {
      title: pick(lang, `Truck booked for ${p.ref}`, `ለ${p.ref} መኪና ተይዟል`),
      body: `${p.driver} · ${p.plate} departs ${formatTime(p.departsAt)}.`,
      sms: `RAHA: ${p.ref} booked. ${p.driver}, truck ${p.plate}, departs ${formatTime(p.departsAt)}.`,
    };
  },

  matchDeclined(lang: Lang, p: { ref: string; by: string; reason?: string | null }): Rendered {
    return {
      title: pick(lang, `${p.ref} was declined`, `${p.ref} ውድቅ ተደርጓል`),
      body: `${p.by} declined${p.reason ? `: ${p.reason}` : ''}. Pick another truck.`,
    };
  },

  /** Sent to the receiver when the truck departs — English + Amharic, exactly as in the design. */
  receiverPin(p: { ref: string; shipper: string; cargo: string; eta: Date; plate: string; pin: string; url: string }): { en: string; am: string } {
    return {
      en: `RAHA: ${p.shipper} sent you ${p.cargo} (${p.ref}). Arriving today ~${formatTime(p.eta)}, truck ${p.plate}.\n\nDelivery PIN: ${p.pin}\nGive it to the driver only after you check the cargo.\n\n${p.url}`,
      am: `ራሃ: ከ${p.shipper} ${p.cargo} ዛሬ ~${formatTime(p.eta)} ይደርሳል። ፒን፦ ${p.pin}`,
    };
  },

  tripStartedForShipper(lang: Lang, p: { ref: string; to: string; eta: Date }): Rendered {
    return {
      title: pick(lang, `${p.ref} is on the road`, `${p.ref} ጉዞ ጀምሯል`),
      body: `Departed. Arrival at ${p.to} about ${formatTime(p.eta)}. The receiver has the delivery PIN.`,
      sms: `RAHA: ${p.ref} departed. Arrives ${p.to} ~${formatTime(p.eta)}.`,
    };
  },

  deliveredForShipper(lang: Lang, p: { ref: string; at: Date; by: string }): Rendered {
    return {
      title: pick(lang, `${p.ref} delivered`, `${p.ref} ደርሷል`),
      body: `Received ${formatTime(p.at)} (${p.by}). Proof is on file.`,
    };
  },

  deliveredForCarrier(lang: Lang, p: { ref: string; amountEtb: number }): Rendered {
    return {
      title: pick(lang, `${p.ref} delivered`, `${p.ref} ደርሷል`),
      body: `Delivery confirmed. ${formatEtb(p.amountEtb)} is now due to you.`,
    };
  },

  paymentRecorded(lang: Lang, p: { ref: string; amountEtb: number; payer: string }): Rendered {
    return {
      title: pick(lang, 'Payment recorded', 'ክፍያ ተመዝግቧል'),
      body: `${formatEtb(p.amountEtb)} for ${p.ref} marked paid by ${p.payer}.`,
      sms: `RAHA: ${formatEtb(p.amountEtb)} for ${p.ref} marked paid by ${p.payer}.`,
    };
  },

  verification(lang: Lang, p: { subject: string; outcome: 'approved' | 'rejected' | 'needs_reupload'; note?: string | null }): Rendered {
    const titles = {
      approved: pick(lang, `${p.subject} verified`, `${p.subject} ተረጋግጧል`),
      rejected: pick(lang, `${p.subject} not approved`, `${p.subject} አልተፈቀደም`),
      needs_reupload: pick(lang, `Upload ${p.subject} again`, `${p.subject} እንደገና ይላኩ`),
    };
    const bodies = {
      approved: `Raha Operations approved your ${p.subject.toLowerCase()}.`,
      rejected: `Raha Operations could not approve your ${p.subject.toLowerCase()}${p.note ? `: ${p.note}` : ''}.`,
      needs_reupload: `We could not read your ${p.subject.toLowerCase()}${p.note ? `: ${p.note}` : ''}. Please upload a clearer photo.`,
    };
    return { title: titles[p.outcome], body: bodies[p.outcome], sms: `RAHA: ${titles[p.outcome]}. ${bodies[p.outcome]}` };
  },

  lateCheckin(lang: Lang, p: { ref: string; hours: number }): Rendered {
    return {
      title: pick(lang, 'Please check in', 'እባክዎ ቼክ-ኢን ያድርጉ'),
      body: `No update on ${p.ref} for ${p.hours} h. Open the app and tap Check in, or reply to this SMS with your town.`,
      sms: `RAHA: ${p.ref} - no update for ${p.hours} h. Reply with your town (e.g. MOJO) or open the app.`,
    };
  },
};

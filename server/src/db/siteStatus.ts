import { db } from './client.js';

export type SiteStatus = {
  frozenAt: string | null;
  frozenBy: number | null;
  frozenMessage: string | null;
};

type SiteStatusRow = {
  frozen_at: string | null;
  frozen_by: number | null;
  frozen_message: string | null;
};

export function getSiteStatus(): SiteStatus {
  const row = db.prepare('SELECT frozen_at, frozen_by, frozen_message FROM site_status WHERE id = 1').get() as
    | SiteStatusRow
    | undefined;
  return {
    frozenAt: row?.frozen_at ?? null,
    frozenBy: row?.frozen_by ?? null,
    frozenMessage: row?.frozen_message ?? null
  };
}

export function setFrozen(frozen: boolean, adminUserId: number, message: string | null): void {
  if (frozen) {
    db.prepare(
      "UPDATE site_status SET frozen_at = datetime('now'), frozen_by = ?, frozen_message = ? WHERE id = 1"
    ).run(adminUserId, message);
  } else {
    db.prepare('UPDATE site_status SET frozen_at = NULL, frozen_by = NULL, frozen_message = NULL WHERE id = 1').run();
  }
}

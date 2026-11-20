/**
 * Who may download data (Excel files, the store file, Reports & downloads). A role switch,
 * "Download data", in Staff & roles; off for field staff. It hides the buttons and the page;
 * it cannot stop someone copying what is on their own screen.
 */
import { canSeeSensitive, type UserWithPermissions } from './permissions';

export function canDownload(user: UserWithPermissions | null | undefined): boolean {
  return canSeeSensitive(user, 's.download');
}

// OneDrive connector - minimum-viable stub.
//
// `lib/notetaker/runtime.ts` imports `getOneDriveConfigForBrain`,
// `ensureTranscriptFolder`, and `uploadTranscript` from this module. The
// real implementation was uncommitted local-only work and never landed on
// any branch. Without this file the production build fails:
//
//   Module not found: Can't resolve '@/lib/connectors/onedrive'
//
// `getOneDriveConfigForBrain` returns null so the existing
// `if (onedriveConfig)` short-circuits in runtime.ts and the OneDrive
// transcript upload path is skipped (rest of the notetaker pipeline still
// runs). The other two functions throw so the absence is loud if anything
// hits them with a non-null config (which can't happen via the runtime
// path, but defends against future direct callers).
//
// Replace with the real OAuth + Graph API client when the OneDrive
// connector ships for real. Pattern should mirror `gmail.ts` /
// `google-drive.ts` / `slack.ts`.

export type OneDriveConfig = {
  brainId: string;
  configId: string;
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: string | null;
  driveId?: string;
};

export type OneDriveFolder = {
  id: string;
  name: string;
  webUrl?: string;
};

export type OneDriveUploadResult = {
  id: string;
  webUrl: string;
  size: number;
};

export async function getOneDriveConfigForBrain(
  _brainId: string,
): Promise<OneDriveConfig | null> {
  // Stub: no OneDrive configuration available. Runtime.ts checks
  // `if (onedriveConfig)` and skips the upload block when this returns
  // null, which is the desired behavior until the real connector lands.
  return null;
}

export async function ensureTranscriptFolder(
  _config: OneDriveConfig,
  _memberEmails: string[],
): Promise<OneDriveFolder> {
  throw new Error(
    "OneDrive connector not implemented. getOneDriveConfigForBrain returns null in this build, so this code path should not be reached.",
  );
}

export async function uploadTranscript(
  _config: OneDriveConfig,
  _folderId: string,
  _filename: string,
  _content: string,
): Promise<OneDriveUploadResult> {
  throw new Error(
    "OneDrive connector not implemented. getOneDriveConfigForBrain returns null in this build, so this code path should not be reached.",
  );
}

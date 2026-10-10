import { PdfDownloadError, type DownloadContext, type PersonalizedDownload } from "./types";

type TrackingDependencies = {
  begin: () => Promise<DownloadContext>;
  prepare: (context: DownloadContext) => Promise<PersonalizedDownload>;
  finish: (context: DownloadContext, error?: PdfDownloadError) => Promise<void>;
};
// Commit the successful generation before exposing bytes. A failure/unknown DB
// outcome never returns a PDF; the reservation expires if cleanup cannot commit.
export async function trackedDownload(dependencies: TrackingDependencies): Promise<PersonalizedDownload> {
  const context = await dependencies.begin();
  let result: PersonalizedDownload;
  try { result = await dependencies.prepare(context); }
  catch (cause) {
    const error = cause instanceof PdfDownloadError ? cause : new PdfDownloadError("DOWNLOAD_FAILED");
    try { await dependencies.finish(context, error); }
    catch { throw new PdfDownloadError("DOWNLOAD_FAILED"); }
    throw error;
  }
  await dependencies.finish(context);
  return result;
}

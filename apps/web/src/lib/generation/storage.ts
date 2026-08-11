import { uploadToS3 } from "@/lib/s3";
import type { GeneratedFile } from "./providers";

export interface StoredFileRef {
  url: string;
  mimeType: string;
  sizeBytes: number | null;
  /** `true` when S3 was unavailable and the file was embedded as a data URI. */
  inline: boolean;
}

/**
 * Persists generated files to object storage (MinIO in dev, any
 * S3-compatible bucket in prod). If storage is unavailable (e.g. MinIO is not
 * running), it gracefully falls back to inline data URIs so the generation
 * pipeline still completes end-to-end in development.
 */
export async function storeGeneratedFiles(input: {
  files: GeneratedFile[];
  teamId: string;
}): Promise<StoredFileRef[]> {
  const results: StoredFileRef[] = [];

  for (const file of input.files) {
    const key = `generated/${input.teamId}/${Date.now()}-${file.filename}`;

    try {
      const url = await uploadToS3({
        key,
        body: file.body,
        contentType: file.contentType,
      });
      results.push({
        url,
        mimeType: file.contentType,
        sizeBytes: file.body.length,
        inline: false,
      });
    } catch (error) {
      console.warn(
        `S3 unavailable, storing "${file.filename}" inline:`,
        error instanceof Error ? error.message : error,
      );
      const dataUrl = `data:${file.contentType};base64,${file.body.toString(
        "base64",
      )}`;
      results.push({
        url: dataUrl,
        mimeType: file.contentType,
        sizeBytes: file.body.length,
        inline: true,
      });
    }
  }

  return results;
}

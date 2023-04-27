import { ModelHashType, ModelModifier } from '@prisma/client';
import { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { getEdgeUrl } from '~/client-utils/cf-images-utils';
import { isProd } from '~/env/other';
import { getDownloadFilename } from '~/pages/api/download/models/[modelVersionId]';
import { createModelFileDownloadUrl } from '~/server/common/model-helpers';
import { dbRead } from '~/server/db/client';
import {
  getModelVersionApiSelect,
  ModelVersionApiReturn,
} from '~/server/selectors/modelVersion.selector';
import { getImagesForModelVersion } from '~/server/services/image.service';
import { PublicEndpoint } from '~/server/utils/endpoint-helpers';
import { getPrimaryFile } from '~/server/utils/model-helpers';

const hashesAsObject = (hashes: { type: ModelHashType; hash: string }[]) =>
  hashes.reduce((acc, { type, hash }) => ({ ...acc, [type]: hash }), {});

const schema = z.object({ id: z.preprocess((val) => Number(val), z.number()) });
export default PublicEndpoint(async function handler(req: NextApiRequest, res: NextApiResponse) {
  const results = schema.safeParse(req.query);
  if (!results.success)
    return res.status(400).json({ error: `Invalid id: ${results.error.flatten().fieldErrors.id}` });

  const { id } = results.data;
  if (!id) return res.status(400).json({ error: 'Missing modelVersionId' });

  const modelVersion = await dbRead.modelVersion.findFirst({
    where: { id },
    select: getModelVersionApiSelect,
  });

  await resModelVersionDetails(req, res, modelVersion);
});

export async function prepareModelVersionResponse(
  modelVersion: ModelVersionApiReturn,
  baseUrl: URL,
  images?: AsyncReturnType<typeof getImagesForModelVersion>
) {
  const { files, model, rank, ...version } = modelVersion;
  const castedFiles = files as Array<
    Omit<(typeof files)[number], 'metadata'> & { metadata: FileMetadata }
  >;
  const primaryFile = getPrimaryFile(castedFiles);
  if (!primaryFile) return null;

  images ??= await getImagesForModelVersion({
    modelVersionIds: [version.id],
    include: ['meta'],
    imagesPerVersion: 10,
  });
  const includeDownloadUrl = model.mode !== ModelModifier.Archived;
  const includeImages = model.mode !== ModelModifier.TakenDown;

  return {
    ...version,
    stats: {
      downloadCount: rank?.downloadCountAllTime ?? 0,
      ratingCount: rank?.ratingCountAllTime ?? 0,
      rating: Number(rank?.ratingAllTime?.toFixed(2) ?? 0),
    },
    model: { ...model, mode: model.mode == null ? undefined : model.mode },
    files: includeDownloadUrl
      ? castedFiles.map(({ hashes, ...file }) => ({
          ...file,
          hashes: hashesAsObject(hashes),
          name: getDownloadFilename({ model, modelVersion: version, file }),
          primary: primaryFile.id === file.id,
          downloadUrl: `${baseUrl.origin}${createModelFileDownloadUrl({
            versionId: version.id,
            type: file.type,
            format: file.metadata.format,
            primary: primaryFile.id === file.id,
          })}`,
        }))
      : [],
    images: includeImages
      ? images.map(({ url, id, userId, name, modelVersionId, ...image }) => ({
          url: getEdgeUrl(url, { width: 450, name: id.toString() }),
          ...image,
        }))
      : [],
    downloadUrl: includeDownloadUrl
      ? `${baseUrl.origin}${createModelFileDownloadUrl({
          versionId: version.id,
          primary: true,
        })}`
      : undefined,
  };
}

export async function resModelVersionDetails(
  req: NextApiRequest,
  res: NextApiResponse,
  modelVersion: ModelVersionApiReturn | null
) {
  if (!modelVersion) return res.status(404).json({ error: 'Model not found' });

  const baseUrl = new URL(isProd ? `https://${req.headers.host}` : 'http://localhost:3000');
  const body = await prepareModelVersionResponse(modelVersion, baseUrl);
  if (!body) return res.status(404).json({ error: 'Missing model file' });
  res.status(200).json(body);
}

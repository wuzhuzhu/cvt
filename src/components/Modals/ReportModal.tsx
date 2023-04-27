import {
  Button,
  Group,
  Radio,
  Stack,
  Text,
  CloseButton,
  ActionIcon,
  Loader,
  Center,
} from '@mantine/core';

import { showNotification, hideNotification } from '@mantine/notifications';
import { NsfwLevel, ReportReason } from '@prisma/client';
import { IconArrowLeft } from '@tabler/icons';
import { useMemo, useState } from 'react';
import { AdminAttentionForm } from '~/components/Report/AdminAttentionForm';
import { ClaimForm } from '~/components/Report/ClaimForm';
import { ImageNsfwForm, ModelNsfwForm } from '~/components/Report/NsfwForm';
import { OwnershipForm } from '~/components/Report/OwnershipForm';
import { TosViolationForm } from '~/components/Report/TosViolationForm';
import { ReportEntity } from '~/server/schema/report.schema';
import { showSuccessNotification, showErrorNotification } from '~/utils/notifications';
import { createContextModal } from '~/components/Modals/utils/createContextModal';
import { trpc } from '~/utils/trpc';
import produce from 'immer';
import { useRouter } from 'next/router';
import { getLoginLink } from '~/utils/login-helpers';
import { useCurrentUser } from '~/hooks/useCurrentUser';
import { useEffect } from 'react';

const reports = [
  {
    reason: ReportReason.NSFW,
    label: 'Mature Content',
    Element: ModelNsfwForm,
    availableFor: [ReportEntity.Model],
  },
  {
    reason: ReportReason.NSFW,
    label: 'Mature Content',
    Element: ImageNsfwForm,
    availableFor: [ReportEntity.Image],
  },
  {
    reason: ReportReason.TOSViolation,
    label: 'TOS Violation',
    Element: TosViolationForm,
    availableFor: [
      ReportEntity.Model,
      ReportEntity.Review,
      ReportEntity.Comment,
      ReportEntity.CommentV2,
      ReportEntity.Image,
      ReportEntity.ResourceReview,
    ],
  },
  {
    reason: ReportReason.AdminAttention,
    label: 'Needs Moderator Review',
    Element: AdminAttentionForm,
    availableFor: [
      ReportEntity.Model,
      ReportEntity.Review,
      ReportEntity.Comment,
      ReportEntity.CommentV2,
      ReportEntity.Image,
      ReportEntity.ResourceReview,
    ],
  },
  {
    reason: ReportReason.Claim,
    label: 'Claim imported model',
    Element: ClaimForm,
    availableFor: [ReportEntity.Model], // TODO only available if model creator/userId === -1
  },
  {
    reason: ReportReason.Ownership,
    label: 'This uses my art',
    Element: OwnershipForm,
    availableFor: [ReportEntity.Model],
  },
];

const invalidateReasons = [ReportReason.NSFW, ReportReason.Ownership];
const SEND_REPORT_ID = 'sending-report';

const { openModal, Modal } = createContextModal<{ entityType: ReportEntity; entityId: number }>({
  name: 'report',
  withCloseButton: false,
  Element: ({ context, props: { entityType, entityId } }) => {
    // #region [temp for gallery image reports]
    const router = useRouter();
    const modelId = router.query.modelId ? Number(router.query.modelId) : undefined;
    const reviewId = router.query.reviewId ? Number(router.query.reviewId) : undefined;
    // #endregion

    //TODO - redirect if no user is authenticated
    const [reason, setReason] = useState<ReportReason>();
    const [uploading, setUploading] = useState(false);
    const ReportForm = useMemo(
      () =>
        reports.find((x) => x.reason === reason && x.availableFor.includes(entityType))?.Element ??
        null,
      [reason]
    );
    const title = useMemo(
      () =>
        reports.find((x) => x.reason === reason && x.availableFor.includes(entityType))?.label ??
        `Report ${entityType}`,
      [reason, entityType]
    );

    const queryUtils = trpc.useContext();
    const { data, isInitialLoading } = trpc.model.getModelReportDetails.useQuery(
      { id: entityId },
      { enabled: entityType === ReportEntity.Model }
    );
    const { mutate, isLoading: isLoading } = trpc.report.create.useMutation({
      onMutate() {
        showNotification({
          id: SEND_REPORT_ID,
          loading: true,
          disallowClose: true,
          autoClose: false,
          message: 'Sending report...',
        });
      },
      async onSuccess(_, variables) {
        showSuccessNotification({
          title: 'Model reported',
          message: 'Your request has been received',
        });
        context.close();
        if (invalidateReasons.some((reason) => reason === variables.reason)) {
          switch (entityType) {
            case ReportEntity.Model:
              queryUtils.model.getById.setData(
                { id: variables.id },
                produce((old) => {
                  if (old) {
                    if (variables.reason === ReportReason.NSFW) {
                      old.nsfw = true;
                    } else if (variables.reason === ReportReason.Ownership) {
                      old.reportStats = { ...old.reportStats, ownershipProcessing: 1 };
                    }
                  }
                })
              );
              await queryUtils.model.getAll.invalidate();
              break;
            case ReportEntity.Review:
              await queryUtils.review.getDetail.invalidate({ id: variables.id });
              await queryUtils.review.getAll.invalidate();
              break;
            case ReportEntity.Comment:
              // Nothing changes here so nothing to invalidate...
              // await queryUtils.comment.getById.invalidate({ id: variables.id });
              // await queryUtils.comment.getAll.invalidate();
              // await queryUtils.comment.getCommentsById.invalidate();
              break;
            case ReportEntity.CommentV2:
              break;
            case ReportEntity.Image:
              if (variables.reason === ReportReason.NSFW) {
                await queryUtils.image.getGalleryImagesInfinite.invalidate();
                await queryUtils.image.getGalleryImages.invalidate();
                await queryUtils.tag.getVotableTags.invalidate({ id: variables.id, type: 'image' });
              }

              // review invalidate
              // if (reviewId) {
              //   queryUtils.review.getDetail.setData(
              //     { id: reviewId },
              //     produce((old) => {
              //       if (old) {
              //         if (variables.reason === ReportReason.NSFW) {
              //           const index = old.images.findIndex((x) => x.id === variables.id);
              //           if (index > -1) old.images[index].nsfw = NsfwLevel.Mature;
              //         }
              //       }
              //     })
              //   );
              // }
              await queryUtils.review.getAll.invalidate();
              // model invalidate
              if (modelId) {
                await queryUtils.model.getAll.invalidate();
              }
              break;
            default:
              break;
          }
        }
      },
      onError(error) {
        showErrorNotification({
          error: new Error(error.message),
          title: 'Unable to send report',
          reason: error.message ?? 'An unexpected error occurred, please try again',
        });
      },
      onSettled() {
        hideNotification(SEND_REPORT_ID);
      },
    });

    const handleSubmit = (data: Record<string, unknown>) => {
      const details: any = Object.fromEntries(Object.entries(data).filter(([_, v]) => v != null));
      if (!reason) return;
      mutate({
        type: entityType,
        reason,
        id: entityId,
        details,
      });
    };

    const currentUser = useCurrentUser();
    useEffect(() => {
      if (currentUser) return;
      router.push(getLoginLink({ returnUrl: router.asPath, reason: 'report-content' }));
      context.close();
    }, [currentUser]);

    return (
      <Stack>
        <Group position="apart" noWrap>
          <Group spacing={4}>
            {!!reason && (
              <ActionIcon onClick={() => setReason(undefined)}>
                <IconArrowLeft size={16} />
              </ActionIcon>
            )}
            <Text>{title}</Text>
          </Group>
          <CloseButton onClick={context.close} />
        </Group>
        {isInitialLoading ? (
          <Center p="xl">
            <Loader />
          </Center>
        ) : (
          !reason && (
            <Radio.Group
              orientation="vertical"
              value={reason}
              onChange={(reason) => setReason(reason as ReportReason)}
              // label="Report reason"
              pb="xs"
            >
              {reports
                .filter(({ availableFor }) => availableFor.includes(entityType))
                .filter((item) => {
                  if (entityType === ReportEntity.Model) {
                    if (item.reason === ReportReason.Claim) return data?.userId !== -1;
                    if (item.reason === ReportReason.Ownership) {
                      return !data?.reportStats?.ownershipPending;
                    }
                  }
                  return true;
                }) // TEMP FIX
                .map(({ reason, label }, index) => (
                  <Radio key={index} value={reason} label={label} />
                ))}
            </Radio.Group>
          )
        )}
        {ReportForm && (
          <ReportForm onSubmit={handleSubmit} setUploading={setUploading}>
            <Group grow>
              <Button variant="default" onClick={context.close}>
                Cancel
              </Button>
              <Button type="submit" loading={isLoading} disabled={uploading}>
                Submit
              </Button>
            </Group>
          </ReportForm>
        )}
      </Stack>
    );
  },
});

export const openReportModal = openModal;
export default Modal;

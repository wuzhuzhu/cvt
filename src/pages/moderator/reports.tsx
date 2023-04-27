import {
  Box,
  Container,
  Table,
  Stack,
  Group,
  Pagination,
  Text,
  Loader,
  LoadingOverlay,
  Badge,
  Menu,
  SegmentedControl,
  Drawer,
  useMantineTheme,
  Title,
  Button,
  ActionIcon,
  Tooltip,
  Input,
  MantineSize,
  Anchor,
  ScrollArea,
  SelectItem,
} from '@mantine/core';
import { ReportReason, ReportStatus } from '@prisma/client';
import { IconExternalLink } from '@tabler/icons';
import produce from 'immer';
import upperFirst from 'lodash/upperFirst';
import Link from 'next/link';
import { GetServerSideProps } from 'next/types';
import { useRouter } from 'next/router';
import { useState, useMemo, useEffect } from 'react';
import { z } from 'zod';

import { getServerAuthSession } from '~/server/utils/get-server-auth-session';
import { trpc } from '~/utils/trpc';
import { QS } from '~/utils/qs';
import { formatDate } from '~/utils/date-helpers';
import {
  ReportEntity,
  reportStatusColorScheme,
  SetReportStatusInput,
} from '~/server/schema/report.schema';
import { DescriptionTable } from '~/components/DescriptionTable/DescriptionTable';
import { getEdgeUrl } from '~/client-utils/cf-images-utils';
import { GetReportsProps } from '~/server/controllers/report.controller';
import { ContentClamp } from '~/components/ContentClamp/ContentClamp';
import { RenderHtml } from '~/components/RenderHtml/RenderHtml';
import { getDisplayName, splitUppercase } from '~/utils/string-helpers';
import { constants } from '~/server/common/constants';
import { useIsMobile } from '~/hooks/useIsMobile';
import { Meta } from '~/components/Meta/Meta';
import { Form, InputTextArea, useForm } from '~/libs/form';
import { showErrorNotification, showSuccessNotification } from '~/utils/notifications';
import { abbreviateNumber } from '~/utils/number-helpers';
import {
  MantineReactTable,
  MRT_ColumnDef,
  MRT_ColumnFiltersState,
  MRT_PaginationState,
  MRT_SortingState,
} from 'mantine-react-table';
import { useQueryClient } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import { createServerSideProps } from '~/server/utils/server-side-helpers';

export const getServerSideProps = createServerSideProps({
  useSession: true,
  resolver: async ({ session }) => {
    if (!session?.user?.isModerator || session.user?.bannedAt) {
      return {
        redirect: {
          destination: '/',
          permanent: false,
        },
      };
    }
  },
});

const limit = constants.reportingFilterDefaults.limit;

type ReportDetail = GetReportsProps['items'][0];
export default function Reports() {
  const router = useRouter();
  const page = router.query.page ? Number(router.query.page) : 1;
  const [type, setType] = useState(ReportEntity.Model);
  const [selected, setSelected] = useState<number>();
  const [columnFilters, setColumnFilters] = useState<MRT_ColumnFiltersState>([
    {
      id: 'reason',
      value: [
        ReportReason.AdminAttention,
        ReportReason.Claim,
        ReportReason.Ownership,
        ReportReason.TOSViolation,
      ],
    },
    {
      id: 'status',
      value: [ReportStatus.Pending, ReportStatus.Processing],
    },
  ]);
  const [sorting, setSorting] = useState<MRT_SortingState>([{ id: 'createdAt', desc: true }]);
  const [pagination, setPagination] = useState<MRT_PaginationState>({
    pageIndex: 0,
    pageSize: 20,
  });

  const { data, isLoading, isFetching } = trpc.report.getAll.useQuery(
    {
      page: pagination.pageIndex + 1,
      limit: pagination.pageSize,
      type,
      filters: columnFilters,
      sort: sorting,
    },
    {
      keepPreviousData: true,
    }
  );
  const reports = useMemo(
    () => data?.items.map((x) => ({ ...x, page, type, limit })) ?? [],
    [data?.items, page, type, limit]
  );

  const handlePageChange = (page: number) => {
    const [pathname, query] = router.asPath.split('?');
    router.replace({ pathname, query: { ...QS.parse(query), page } }, undefined, {
      shallow: true,
    });
    setSelected(undefined);
  };

  const handleTypeChange = (type: ReportEntity) => {
    handlePageChange(1);
    setType(type);
    setSelected(undefined);
  };

  const columns = useMemo<MRT_ColumnDef<(typeof reports)[0]>[]>(
    () => [
      {
        id: 'id',
        accesorKey: 'id',
        header: '',
        Cell: ({ row: { original: report } }) => (
          <Group spacing="xs" noWrap>
            <Button compact size="xs" onClick={() => setSelected(report.id)}>
              Details
            </Button>
            <Tooltip label="Open reported item" withArrow>
              <ActionIcon
                component="a"
                href={getReportLink(report)}
                target="_blank"
                variant="subtle"
                size="sm"
              >
                <IconExternalLink />
              </ActionIcon>
            </Tooltip>
          </Group>
        ),
        enableHiding: false,
        enableSorting: false,
        enableColumnFilter: false,
        enableColumnActions: false,
        width: 120,
      },
      {
        id: 'reason',
        header: 'Reason',
        accessorFn: (x) => splitUppercase(x.reason),
        filterFn: 'equals',
        filterVariant: 'multi-select',
        enableSorting: false,
        mantineFilterMultiSelectProps: {
          data: Object.values(ReportReason).map(
            (x) =>
              ({
                label: getDisplayName(x),
                value: x,
              } as SelectItem)
          ) as any,
        },
      },
      {
        accessorKey: 'status',
        header: 'Status',
        Cell: ({ row: { original: report } }) => (
          <ToggleReportStatus id={report.id} status={report.status} size="md" />
        ),
        filterFn: 'equals',
        filterVariant: 'multi-select',
        enableSorting: false,
        mantineFilterMultiSelectProps: {
          data: Object.values(ReportStatus).map(
            (x) =>
              ({
                label: getDisplayName(x),
                value: x,
              } as SelectItem)
          ) as any,
        },
      },
      {
        id: 'createdAt',
        accessorFn: (x) => formatDate(x.createdAt),
        header: 'Reported',
        filterVariant: 'date',
      },
      {
        id: 'reportedBy',
        accessorFn: (x) => x.user.username,
        header: 'Reported by',
        enableSorting: false,
        Cell: ({ row: { original: report } }) => (
          <Link href={`/user/${report.user.username}`} passHref>
            <Text variant="link" component="a" target="_blank">
              {report.user.username}
            </Text>
          </Link>
        ),
      },
      {
        id: 'alsoReportedBy',
        header: 'Also reported by',
        accessorFn: (x) =>
          x.alsoReportedBy.length ? `${abbreviateNumber(x.alsoReportedBy.length)} Users` : null,
        enableSorting: false,
        enableColumnFilter: false,
      },
    ],
    []
  );

  return (
    <>
      <Meta title="Reports" />
      <Container size="xl" pb="xl">
        <Stack>
          <Group align="flex-end">
            <Title>Reports</Title>
            <SegmentedControl
              size="sm"
              data={Object.values(ReportEntity).map((x) => ({ label: upperFirst(x), value: x }))}
              onChange={handleTypeChange}
              value={type}
            />
          </Group>
          <MantineReactTable
            columns={columns}
            data={reports}
            manualFiltering
            manualPagination
            manualSorting
            onColumnFiltersChange={setColumnFilters}
            onPaginationChange={setPagination}
            onSortingChange={setSorting}
            enableMultiSort={false}
            rowCount={data?.totalItems ?? 0}
            enableStickyHeader
            enableHiding={false}
            enableGlobalFilter={false}
            mantineTableContainerProps={{
              sx: { maxHeight: 'calc(100vh - 360px)' },
            }}
            initialState={{
              density: 'sm',
            }}
            state={{
              isLoading,
              pagination,
              columnFilters,
              showProgressBars: isFetching,
              sorting,
            }}
          />
        </Stack>
      </Container>
      {data && (
        <ReportDrawer
          report={data.items.find((x) => x.id === selected)}
          onClose={() => setSelected(undefined)}
          type={type}
        />
      )}
    </>
  );
}

const schema = z.object({ internalNotes: z.string().nullish() });

function ReportDrawer({
  report,
  onClose,
  type,
}: {
  report?: ReportDetail;
  onClose: () => void;
  type: ReportEntity;
}) {
  const theme = useMantineTheme();
  const mobile = useIsMobile();
  const href = useMemo(() => (report ? getReportLink(report) : null), [report]);
  const queryUtils = trpc.useContext();

  const form = useForm({
    schema,
    defaultValues: { internalNotes: report?.internalNotes ?? null },
  });
  const { isDirty } = form.formState;

  const updateReportMutation = trpc.report.update.useMutation({
    async onSuccess(results) {
      await queryUtils.report.getAll.invalidate();
      form.reset({
        internalNotes: results.internalNotes,
      });
      showSuccessNotification({
        title: 'Report updated successfully',
        message: 'Internal notes have been saved',
      });
      if (mobile) onClose?.();
    },
    onError(error) {
      showErrorNotification({ error: new Error(error.message) });
    },
  });
  const handleSaveReport = (data: z.infer<typeof schema>) => {
    if (report) updateReportMutation.mutate({ ...report, ...data });
  };

  useEffect(() => {
    if (report)
      form.reset({
        internalNotes: report.internalNotes,
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report]);

  return (
    <Drawer
      withOverlay={false}
      opened={!!report}
      onClose={onClose}
      position={mobile ? 'bottom' : 'right'}
      title={`${upperFirst(type)} Report Details`}
      size={mobile ? '100%' : 'xl'}
      padding="md"
      shadow="sm"
      zIndex={500}
      styles={{
        drawer: {
          borderLeft: `1px solid ${
            theme.colorScheme === 'dark' ? theme.colors.dark[4] : theme.colors.gray[3]
          }`,
        },
      }}
    >
      {report && (
        <Stack>
          {href && (
            <Link href={href} passHref>
              <Anchor size="sm" target="_blank">
                <Group spacing={4}>
                  <Text inherit>View {type}</Text>
                  <IconExternalLink size={14} stroke={1.5} />
                </Group>
              </Anchor>
            </Link>
          )}
          <ReportDetails report={report} />
          <Input.Wrapper
            label="Status"
            description="Use this input to set the status of the report"
            descriptionProps={{ sx: { marginBottom: 5 } }}
          >
            <ToggleReportStatus id={report.id} status={report.status} size="md" />
          </Input.Wrapper>
          <Form form={form} onSubmit={handleSaveReport}>
            <Stack>
              <InputTextArea
                name="internalNotes"
                label="Internal Notes"
                description="Leave an internal note for future reference (optional)"
                placeholder="Add note..."
                minRows={2}
                autosize
              />
              <Group position="right">
                <Button type="submit" disabled={!isDirty} loading={updateReportMutation.isLoading}>
                  Save
                </Button>
              </Group>
            </Stack>
          </Form>
        </Stack>
      )}
    </Drawer>
  );
}

function ReportDetails({ report }: { report: ReportDetail }) {
  const { details } = report;
  if (!details) return null;
  if (typeof details === 'string' || typeof details === 'number' || typeof details === 'boolean')
    return <>{details}</>;
  if (Array.isArray(details)) return <>Bad data</>;

  const entries = Object.entries(details);
  if (entries.length === 0) return null;

  const detailItems = entries
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => {
      const label = upperFirst(key);
      if (key === 'images' && Array.isArray(value))
        return {
          label,
          value: (
            <Stack spacing="xs">
              {value.map((cuid, i) => {
                if (typeof cuid !== 'string') return null;
                return (
                  <Text
                    key={cuid}
                    component="a"
                    variant="link"
                    href={getEdgeUrl(cuid, { width: 450, name: cuid })}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Image {i + 1}
                  </Text>
                );
              })}
            </Stack>
          ),
        };
      if (key === 'comment' && typeof value === 'string')
        return {
          label,
          value: (
            <ContentClamp maxHeight={100}>
              <RenderHtml html={value} />
            </ContentClamp>
          ),
        };

      return { label, value: value?.toString() };
    });

  if (report.image) {
    const sourceHref = report.image.reviewId
      ? `/models/${report.image.modelId}/?modal=reviewThread&reviewId=${report.image.reviewId}`
      : `/models/${report.image.modelId}`;

    detailItems.push({
      label: 'Source',
      value: (
        <Text component="a" href={sourceHref} variant="link" target="_blank">
          {report.image.reviewId ? 'Review' : 'Model Samples'}
        </Text>
      ),
    });
  }

  if (report.reason === 'Ownership') {
    detailItems.unshift({
      label: 'Claiming User',
      value: (
        <Text component="a" href={`mailto:${report.user.email}}`} variant="link" target="_blank">
          {report.user.username} ({report.user.email})
        </Text>
      ),
    });
  }

  return <DescriptionTable items={detailItems} labelWidth="30%" />;
}

const getReportLink = (report: ReportDetail) => {
  if (report.model) return `/models/${report.model.id}`;
  else if (report.review)
    return `/models/${report.review.modelId}/?modal=reviewThread&reviewId=${report.review.id}`;
  else if (report.resourceReview) return `/reviews/${report.resourceReview.id}`;
  else if (report.comment)
    return `/models/${report.comment.modelId}/?modal=commentThread&commentId=${
      report.comment.parentId ?? report.comment.id
    }&highlight=${report.comment.id}`;
  else if (report.image) {
    const returnUrl = report.image.reviewId
      ? `/models/${report.image.modelId}/?modal=reviewThread&reviewId=${report.image.reviewId}`
      : `/models/${report.image.modelId}`;
    const parts = [`returnUrl=${encodeURIComponent(returnUrl)}`];
    if (report.image.modelId) parts.push(`modelId=${report.image.modelId}`);
    if (report.image.modelVersionId) parts.push(`modelVersionId=${report.image.modelVersionId}`);
    if (report.image.reviewId) parts.push(`reviewId=${report.image.reviewId}`);
    return `/images/${report.image.id}/?${parts.join('&')}`;
  }
};

function ToggleReportStatus({ id, status, size }: SetReportStatusInput & { size?: MantineSize }) {
  // TODO.Briant - create a helper function for this
  const queryClient = useQueryClient();
  // TODO.manuel - not sure why we use useQueryClient here to optimistically update the query
  // but doing this hotfix for now
  const queryUtils = trpc.useContext();

  const { mutate, isLoading } = trpc.report.setStatus.useMutation({
    onSuccess(_, request) {
      const queryKey = getQueryKey(trpc.report.getAll);
      queryClient.setQueriesData(
        { queryKey, exact: false },
        produce((old: any) => {
          const item = old?.items?.find((x: any) => x.id === id);
          if (item) item.status = request.status;
        })
      );
    },
    onError(error) {
      showErrorNotification({
        title: 'Failed to set report status',
        error: new Error(error.message),
      });
    },
    async onSettled() {
      await queryUtils.report.getAll.invalidate();
    },
  });
  const statusColor = reportStatusColorScheme[status];

  return (
    <Menu>
      <Menu.Target>
        <Badge color={statusColor} size={size} sx={{ cursor: 'pointer' }}>
          {isLoading ? <Loader variant="dots" size="sm" mx="md" color={statusColor} /> : status}
        </Badge>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Set Status</Menu.Label>
        <Menu.Divider />
        {Object.values(ReportStatus)
          .filter((x) => x !== status)
          .map((reportStatus, i) => (
            <Menu.Item key={i} onClick={() => mutate({ id, status: reportStatus })}>
              {reportStatus}
            </Menu.Item>
          ))}
      </Menu.Dropdown>
    </Menu>
  );
}

// function ReportReason({reason, details}: {reason: ReportReason, details:})

// function ReportAction({ entityId, entityType }: { entityId: number; entityType: ReportEntity }) {
//   return <></>;
// }
